// features/reports/export.ts
import { copyAsync, deleteAsync, documentDirectory } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { buildReportData } from './reportData';
import { generateReportPdf } from './generatePdf';
import type { BuildReportInput } from './types';

/** Thrown when the picked month has no transactions — the caller shows a hint, no file is made. */
export class EmptyMonthError extends Error {
  constructor() {
    super('empty month');
    this.name = 'EmptyMonthError';
  }
}

export async function exportMonthlyReport(input: BuildReportInput): Promise<void> {
  const data = buildReportData(input);
  if (data.categories.length === 0) throw new EmptyMonthError();

  const uri = await generateReportPdf(data);

  // expo-print writes outside the app's *scoped* storage. ExpoSharing's
  // FilePermissionService only grants read access to the scoped document/cache
  // dirs, so sharing the print uri directly (or a copy under Paths.cache) throws
  // "Not allowed to read file under given URL" — notably in Expo Go. Copy the PDF
  // into the scoped document directory (readable by the share provider) and share
  // that; this also gives the file a branded, human-readable name.
  let shareUri = uri;
  if (documentDirectory) {
    shareUri = `${documentDirectory}Teftera-${data.monthISO}.pdf`;
    await deleteAsync(shareUri, { idempotent: true });
    await copyAsync({ from: uri, to: shareUri });
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error(`Файлът е запазен: ${shareUri}`);
  }
  await Sharing.shareAsync(shareUri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: `Отчет ${data.monthLabel}`,
  });
}

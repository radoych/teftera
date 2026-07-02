// features/reports/export.ts
import { documentDirectory, writeAsStringAsync } from 'expo-file-system/legacy';
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

  // expo-print writes its file outside the app's *scoped* storage. In Expo Go that
  // path can't even be read back (both copyAsync and shareAsync fail with
  // "isn't readable" / "Not allowed to read file under given URL"). So take the PDF
  // as base64 straight from expo-print and write those bytes into the scoped
  // document directory ourselves — a readable, shareable location, with a branded name.
  const base64 = await generateReportPdf(data);
  if (!documentDirectory) throw new Error('Няма достъпна директория за запис.');
  const shareUri = `${documentDirectory}Teftera-${data.monthISO}.pdf`;
  await writeAsStringAsync(shareUri, base64, { encoding: 'base64' });

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error(`Файлът е запазен: ${shareUri}`);
  }
  await Sharing.shareAsync(shareUri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: `Отчет ${data.monthLabel}`,
  });
}

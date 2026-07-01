// features/reports/export.ts
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

  // Share the file expo-print wrote directly — this is the location the OS share
  // sheet is allowed to read. (Copying it to a branded name under Paths.cache
  // produced a URL that ExpoSharing rejects with "Not allowed to read file
  // under given URL", so the month is conveyed via dialogTitle instead.)
  const uri = await generateReportPdf(data);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error(`Файлът е запазен: ${uri}`);
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: `Отчет ${data.monthLabel}`,
  });
}

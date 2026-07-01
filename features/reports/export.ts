// features/reports/export.ts
import { File, Paths } from 'expo-file-system';
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

  // Best-effort rename to a branded filename — a copy failure must never break a working share.
  let shareUri = uri;
  try {
    const named = new File(Paths.cache, `Teftera-${data.monthISO}.pdf`);
    await new File(uri).copy(named, { overwrite: true });
    shareUri = named.uri;
  } catch {
    // fall back to the original temp uri
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

// features/reports/generatePdf.ts
// The ONLY module that changes when the report moves to a Cloud Run backend:
// today it renders locally with expo-print; later it POSTs `data` to the service.
// Everything upstream stays identical. Returns the PDF as a base64 string (no
// data-URI prefix) rather than a file uri: expo-print writes its file outside the
// app's scoped storage, which Expo Go can't read back — so the caller writes the
// bytes into a readable location itself. A Cloud Run backend would likewise return
// bytes, so base64 is the natural seam contract.
import * as Print from 'expo-print';
import { buildReportHtml } from './reportHtml';
import { TEFTERA_LOGO_DATA_URI } from './logo';
import type { ReportData } from './types';

export async function generateReportPdf(data: ReportData): Promise<string> {
  const html = buildReportHtml(data, TEFTERA_LOGO_DATA_URI);
  const { base64 } = await Print.printToFileAsync({ html, base64: true });
  if (!base64) throw new Error('expo-print returned no base64 PDF data');
  return base64;
}

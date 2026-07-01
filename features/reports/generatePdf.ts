// features/reports/generatePdf.ts
// The ONLY module that changes when the report moves to a Cloud Run backend:
// today it renders locally with expo-print; later it POSTs `data` to the service
// and writes the returned PDF to a file. Everything upstream stays identical.
import * as Print from 'expo-print';
import { buildReportHtml } from './reportHtml';
import { TEFTERA_LOGO_DATA_URI } from './logo';
import type { ReportData } from './types';

export async function generateReportPdf(data: ReportData): Promise<string> {
  const html = buildReportHtml(data, TEFTERA_LOGO_DATA_URI);
  const { uri } = await Print.printToFileAsync({ html });
  return uri;
}

import type { BuildReportInput } from './types';
import type { Transaction } from '@/features/transactions/types';

const mockGenerateReportPdf = jest.fn();
const mockIsAvailableAsync = jest.fn();
const mockShareAsync = jest.fn();
const mockWrite = jest.fn();

jest.mock('./generatePdf', () => ({ generateReportPdf: (d: unknown) => mockGenerateReportPdf(d) }));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => mockIsAvailableAsync(),
  shareAsync: (...a: unknown[]) => mockShareAsync(...a),
}));
// The PDF base64 must be written into the scoped document dir before sharing —
// expo-print's own file lives outside it and Expo Go can't read it back.
jest.mock('expo-file-system', () => ({
  Paths: { document: { uri: 'file:///doc/' } },
  File: class {
    uri: string;
    constructor(dir: { uri: string }, name: string) {
      this.uri = `${dir.uri}${name}`;
    }
    write(...a: unknown[]) {
      mockWrite(this.uri, ...a);
    }
  },
}));

import { exportMonthlyReport, EmptyMonthError } from './export';

function tx(over: Partial<Transaction>): Transaction {
  return {
    id: 'a', household_id: 'h', user_id: 'u', amount_eur: 3000, original_amount: null,
    original_currency: null, merchant: 'Kaufland', category_id: null, date: '2026-06-05',
    note: null, source: 'manual', kind: 'expense', receipt_id: null, is_flagged: false, occurred_at: null,
    created_at: '2026-06-05T00:00:00Z', ...over,
  };
}

const baseInput: BuildReportInput = {
  transactions: [], categories: [], budgetRows: [], openAnomalies: [],
  month: new Date(2026, 5, 15), now: new Date(2026, 6, 1),
};

beforeEach(() => {
  mockGenerateReportPdf.mockReset().mockResolvedValue('BASE64PDFDATA');
  mockIsAvailableAsync.mockReset().mockResolvedValue(true);
  mockShareAsync.mockReset().mockResolvedValue(undefined);
  mockWrite.mockReset();
});

describe('exportMonthlyReport', () => {
  it('throws EmptyMonthError and never renders when the month has no transactions', async () => {
    await expect(exportMonthlyReport(baseInput)).rejects.toBeInstanceOf(EmptyMonthError);
    expect(mockGenerateReportPdf).not.toHaveBeenCalled();
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  it('writes the PDF base64 into the scoped document dir and shares that branded path', async () => {
    await exportMonthlyReport({ ...baseInput, transactions: [tx({})] });
    expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1);
    expect(mockWrite).toHaveBeenCalledWith(
      'file:///doc/Teftera-2026-06.pdf',
      'BASE64PDFDATA',
      { encoding: 'base64' },
    );
    expect(mockShareAsync).toHaveBeenCalledWith(
      'file:///doc/Teftera-2026-06.pdf',
      expect.objectContaining({ mimeType: 'application/pdf' }),
    );
  });

  it('throws with the scoped file path when sharing is unavailable', async () => {
    mockIsAvailableAsync.mockResolvedValue(false);
    await expect(exportMonthlyReport({ ...baseInput, transactions: [tx({})] })).rejects.toThrow(
      'file:///doc/Teftera-2026-06.pdf',
    );
    expect(mockShareAsync).not.toHaveBeenCalled();
  });
});

import type { BuildReportInput } from './types';
import type { Transaction } from '@/features/transactions/types';

const mockGenerateReportPdf = jest.fn();
const mockIsAvailableAsync = jest.fn();
const mockShareAsync = jest.fn();
const mockCopyAsync = jest.fn();

jest.mock('./generatePdf', () => ({ generateReportPdf: (d: unknown) => mockGenerateReportPdf(d) }));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => mockIsAvailableAsync(),
  shareAsync: (...a: unknown[]) => mockShareAsync(...a),
}));
// New expo-file-system object API (matches features/receipts/storage.ts): `File` instances with a
// `.copy()` method, and `Paths.cache` for the cache directory — no legacy `copyAsync`/`cacheDirectory`.
jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string;
    constructor(...args: unknown[]) {
      this.uri =
        args.length === 1 && typeof args[0] === 'string' ? (args[0] as string) : `${args[0]}${args[1]}`;
    }
    copy(...a: unknown[]) {
      return mockCopyAsync(...a);
    }
  }
  return { Paths: { cache: 'file:///cache/' }, File: MockFile };
});

import { exportMonthlyReport, EmptyMonthError } from './export';

function tx(over: Partial<Transaction>): Transaction {
  return {
    id: 'a', household_id: 'h', user_id: 'u', amount_eur: 3000, original_amount: null,
    original_currency: null, merchant: 'Kaufland', category_id: null, date: '2026-06-05',
    note: null, source: 'manual', receipt_id: null, is_flagged: false, occurred_at: null,
    created_at: '2026-06-05T00:00:00Z', ...over,
  };
}

const baseInput: BuildReportInput = {
  transactions: [], categories: [], budgetRows: [], openAnomalies: [],
  month: new Date(2026, 5, 15), now: new Date(2026, 6, 1),
};

beforeEach(() => {
  mockGenerateReportPdf.mockReset().mockResolvedValue('file:///report.pdf');
  mockIsAvailableAsync.mockReset().mockResolvedValue(true);
  mockShareAsync.mockReset().mockResolvedValue(undefined);
  mockCopyAsync.mockReset().mockResolvedValue(undefined);
});

describe('exportMonthlyReport', () => {
  it('throws EmptyMonthError and never renders when the month has no transactions', async () => {
    await expect(exportMonthlyReport(baseInput)).rejects.toBeInstanceOf(EmptyMonthError);
    expect(mockGenerateReportPdf).not.toHaveBeenCalled();
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  it('generates and shares the PDF under a branded Teftera-<month>.pdf name', async () => {
    await exportMonthlyReport({ ...baseInput, transactions: [tx({})] });
    expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1);
    expect(mockCopyAsync).toHaveBeenCalledTimes(1);
    expect(mockShareAsync).toHaveBeenCalledWith(
      'file:///cache/Teftera-2026-06.pdf',
      expect.objectContaining({ mimeType: 'application/pdf' }),
    );
  });

  it('falls back to the original temp uri when the branded copy fails', async () => {
    mockCopyAsync.mockRejectedValue(new Error('disk full'));
    await exportMonthlyReport({ ...baseInput, transactions: [tx({})] });
    expect(mockShareAsync).toHaveBeenCalledWith(
      'file:///report.pdf',
      expect.objectContaining({ mimeType: 'application/pdf' }),
    );
  });

  it('throws with the branded file path when sharing is unavailable', async () => {
    mockIsAvailableAsync.mockResolvedValue(false);
    await expect(exportMonthlyReport({ ...baseInput, transactions: [tx({})] })).rejects.toThrow(
      'file:///cache/Teftera-2026-06.pdf',
    );
    expect(mockShareAsync).not.toHaveBeenCalled();
  });
});

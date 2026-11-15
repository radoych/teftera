// features/transactions/preview.ts — partition parsed import rows for the review screen.
import { windowStartISO } from '@/lib/dates';
import type { NormalizedTransaction } from '@/services/dsk-import';
import { TRANSACTION_WINDOW_MONTHS } from './api';
import { dedupeImport } from './dedup';
import { expensesOnly, incomeOnly } from './kind';
import type { Transaction } from './types';

export type ImportSource = 'csv' | 'bank';

export interface ImportPreview {
  newExpenses: NormalizedTransaction[];
  newIncome: NormalizedTransaction[];
  duplicates: NormalizedTransaction[];
  fileName: string;
  source: ImportSource;
  truncated: boolean;
  outOfWindow: boolean;
}

/**
 * Partition freshly-parsed rows into new-expense / new-income / duplicate buckets, and flag
 * rows the dedup window can't cover (older than the fetched-transaction window).
 */
export function buildPreview(
  rows: NormalizedTransaction[],
  existing: Transaction[],
  fileName: string,
  source: ImportSource,
  truncated: boolean,
  windowStart: string = windowStartISO(TRANSACTION_WINDOW_MONTHS),
): ImportPreview {
  const { toImport, duplicates } = dedupeImport(rows, existing);
  return {
    newExpenses: expensesOnly(toImport),
    newIncome: incomeOnly(toImport),
    duplicates,
    fileName,
    source,
    truncated,
    outOfWindow: rows.some((r) => r.date < windowStart),
  };
}

/** Rows the preview would insert (expenses first, then income). */
export function previewCandidates(preview: ImportPreview): NormalizedTransaction[] {
  return [...preview.newExpenses, ...preview.newIncome];
}

import { toISODate } from '@/lib/dates';
import type { Transaction } from '@/features/transactions/types';

export type TimeRange = 'this_month' | 'last_month' | 'last_3_months' | 'year';

export interface DateBounds {
  startISO: string; // inclusive YYYY-MM-DD
  endISO: string; // inclusive YYYY-MM-DD
}

function bounds(start: Date, end: Date): DateBounds {
  return { startISO: toISODate(start), endISO: toISODate(end) };
}

/** Inclusive [start, end] window for a range, aligned to calendar-month edges. */
export function rangeBounds(range: TimeRange, now: Date = new Date()): DateBounds {
  const y = now.getFullYear();
  const m = now.getMonth();
  const lastOfThisMonth = new Date(y, m + 1, 0); // day 0 = last day of month m
  switch (range) {
    case 'this_month':
      return bounds(new Date(y, m, 1), lastOfThisMonth);
    case 'last_month':
      return bounds(new Date(y, m - 1, 1), new Date(y, m, 0));
    case 'last_3_months':
      return bounds(new Date(y, m - 2, 1), lastOfThisMonth);
    case 'year':
      return bounds(new Date(y, m - 11, 1), lastOfThisMonth);
  }
}

/** Inclusive window immediately preceding `range`, of equal length. */
export function comparisonRange(range: TimeRange, now: Date = new Date()): DateBounds {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (range) {
    case 'this_month':
      return bounds(new Date(y, m - 1, 1), new Date(y, m, 0));
    case 'last_month':
      return bounds(new Date(y, m - 2, 1), new Date(y, m - 1, 0));
    case 'last_3_months':
      return bounds(new Date(y, m - 5, 1), new Date(y, m - 2, 0));
    case 'year':
      return bounds(new Date(y, m - 23, 1), new Date(y, m - 11, 0));
  }
}

/** Transactions whose `date` falls within [startISO, endISO] inclusive. */
export function filterByDateBounds(
  txs: Transaction[],
  startISO: string,
  endISO: string,
): Transaction[] {
  return txs.filter((tx) => tx.date >= startISO && tx.date <= endISO);
}

/** Transactions within the given range window. */
export function filterByRange(
  txs: Transaction[],
  range: TimeRange,
  now: Date = new Date(),
): Transaction[] {
  const { startISO, endISO } = rangeBounds(range, now);
  return filterByDateBounds(txs, startISO, endISO);
}

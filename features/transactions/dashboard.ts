// features/transactions/dashboard.ts — pure aggregation helpers for the dashboard.
import { toISODate } from '@/lib/dates';
import type { MaterialIconName } from '@/lib/categories';
import type { CategoryLite } from './groupByDay';
import type { Transaction } from './types';

const FALLBACK_ID = 'uncategorized';
const FALLBACK_ICON: MaterialIconName = 'category';
const FALLBACK_COLOR = '#8e909a';
const FALLBACK_NAME = 'Other';

/** Sum of amount_eur (cents) for transactions dated today. */
export function dayTotalCents(txs: Transaction[], now: Date = new Date()): number {
  const today = toISODate(now);
  return txs.reduce((sum, tx) => (tx.date === today ? sum + tx.amount_eur : sum), 0);
}

function monthPrefix(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-`;
}

/** Sum of amount_eur (cents) for the previous calendar month. */
export function prevMonthTotalCents(txs: Transaction[], now: Date = new Date()): number {
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prefix = monthPrefix(prev.getFullYear(), prev.getMonth());
  return txs.reduce((sum, tx) => (tx.date.startsWith(prefix) ? sum + tx.amount_eur : sum), 0);
}

/** Signed, rounded percentage change from previous→current. Null when there is no baseline. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Filter to one user's transactions; a null userId returns the whole household. */
export function filterByUser(txs: Transaction[], userId: string | null): Transaction[] {
  if (userId === null) return txs;
  return txs.filter((tx) => tx.user_id === userId);
}

/**
 * Sort by created_at — order of ADDITION, regardless of the transaction's own
 * date. Used for "recent" lists, where a just-entered backdated transaction
 * (e.g. an old CSV import row) should still surface as recent.
 */
export function sortByCreatedAt(txs: Transaction[], desc: boolean): Transaction[] {
  return [...txs].sort((a, b) => {
    const cmp = a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
    return desc ? -cmp : cmp;
  });
}

/** One category's spend bucket, with a bar fraction relative to the largest bucket. */
export interface CategorySpend {
  id: string;
  name: string;
  icon: MaterialIconName;
  color: string;
  totalCents: number;
  fraction: number; // 0..1 of the largest bucket
}

/**
 * Group → sort → fraction for an already-filtered set of transactions.
 * Unknown/null category → an "Other" row. `fraction` is relative to the
 * largest bucket. This is the shared core used by the dashboard and insights.
 */
export function categoryBreakdown(
  txs: Transaction[],
  categories: CategoryLite[],
): CategorySpend[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string, number>();

  for (const tx of txs) {
    const cat = tx.category_id ? byId.get(tx.category_id) : undefined;
    const key = cat ? cat.id : FALLBACK_ID;
    totals.set(key, (totals.get(key) ?? 0) + tx.amount_eur);
  }

  const rows: CategorySpend[] = [...totals.entries()].map(([id, totalCents]) => {
    const cat = byId.get(id);
    return {
      id,
      name: cat?.name ?? FALLBACK_NAME,
      icon: (cat?.icon as MaterialIconName) ?? FALLBACK_ICON,
      color: cat?.color ?? FALLBACK_COLOR,
      totalCents,
      fraction: 0,
    };
  });

  rows.sort((a, b) => b.totalCents - a.totalCents);
  const max = rows[0]?.totalCents ?? 0;
  if (max > 0) for (const row of rows) row.fraction = row.totalCents / max;
  return rows;
}

/** Current-month spend grouped by category, sorted high to low. Unknown/null → "Other". */
export function spendingByCategory(
  txs: Transaction[],
  categories: CategoryLite[],
  now: Date = new Date(),
): CategorySpend[] {
  const prefix = monthPrefix(now.getFullYear(), now.getMonth());
  return categoryBreakdown(
    txs.filter((tx) => tx.date.startsWith(prefix)),
    categories,
  );
}

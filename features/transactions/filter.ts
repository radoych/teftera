import type { Transaction } from './types';

export type PersonScope = 'all' | 'me';

export interface HistoryFilter {
  /** Substring match against merchant + note, case-insensitive. '' = off. */
  query: string;
  /** Keep only these category ids. Empty = all categories. */
  categoryIds: ReadonlyArray<string>;
  person: PersonScope;
  myUserId: string | null;
}

/** Apply the History screen's search + filter controls to the raw list. */
export function filterTransactions(
  txs: ReadonlyArray<Transaction>,
  f: HistoryFilter,
): Transaction[] {
  const q = f.query.trim().toLowerCase();
  return txs.filter((t) => {
    if (q !== '' && !`${t.merchant} ${t.note ?? ''}`.toLowerCase().includes(q)) return false;
    if (f.categoryIds.length > 0 && !f.categoryIds.includes(t.category_id ?? '')) return false;
    if (f.person === 'me' && t.user_id !== f.myUserId) return false;
    return true;
  });
}

/** How many filter controls (not search) are active — shown on the Филтри pill. */
export function activeFilterCount(f: Pick<HistoryFilter, 'categoryIds' | 'person'>): number {
  return (f.categoryIds.length > 0 ? 1 : 0) + (f.person === 'me' ? 1 : 0);
}

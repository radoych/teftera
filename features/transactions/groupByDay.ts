import { formatTime, relativeDay } from '@/lib/dates';
import type { MaterialIconName } from '@/lib/categories';
import type { Transaction, TransactionDayGroup, TransactionView } from './types';

export interface CategoryLite {
  id: string;
  name: string;
  icon: string;
  color: string;
}

const FALLBACK_ICON: MaterialIconName = 'category';
const FALLBACK_COLOR = '#8e909a';
const FALLBACK_NAME = 'Other';

/** Map one DB transaction to its presentational view, joining category data. */
export function toTransactionView(
  tx: Transaction,
  byId: Map<string, CategoryLite>,
  now: Date = new Date(),
): TransactionView {
  const cat = tx.category_id ? byId.get(tx.category_id) : undefined;
  const name = cat?.name ?? FALLBACK_NAME;
  const time = formatTime(new Date(tx.created_at));
  // flagReason/isIncome deferred (anomaly + income land in later days)
  return {
    id: tx.id,
    merchant: tx.merchant,
    meta: `${name} • ${time}`,
    amountCents: tx.amount_eur,
    icon: (cat?.icon as MaterialIconName) ?? FALLBACK_ICON,
    iconColor: cat?.color ?? FALLBACK_COLOR,
    isFlagged: tx.is_flagged,
  };
}

/** Group transactions into day buckets, newest day first, preserving input order within a day. */
export function groupTransactionsByDay(
  txs: Transaction[],
  categories: CategoryLite[],
  now: Date = new Date(),
): TransactionDayGroup[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const sorted = [...txs].map((tx, idx) => ({ tx, idx })).sort((a, b) => {
    if (a.tx.date !== b.tx.date) return a.tx.date < b.tx.date ? 1 : -1; // date desc
    if (a.tx.created_at !== b.tx.created_at) return a.tx.created_at < b.tx.created_at ? 1 : -1; // newest first within a day
    return a.idx - b.idx; // preserve input order when equal
  }).map((x) => x.tx);

  const groups: TransactionDayGroup[] = [];
  const groupByDate = new Map<string, TransactionDayGroup>();
  for (const tx of sorted) {
    let group = groupByDate.get(tx.date);
    if (!group) {
      group = { label: relativeDay(tx.date, now), items: [] };
      groupByDate.set(tx.date, group);
      groups.push(group);
    }
    group.items.push(toTransactionView(tx, byId, now));
  }
  return groups;
}

/** Sum of amount_eur (cents) for transactions in the current calendar month. */
export function monthTotalCents(txs: Transaction[], now: Date = new Date()): number {
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-`;
  return txs.reduce((sum, tx) => (tx.date.startsWith(prefix) ? sum + tx.amount_eur : sum), 0);
}

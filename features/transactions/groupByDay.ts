import { categoryPresentation } from '@/lib/categories';
import { formatTime, relativeDay } from '@/lib/dates';
import type { CategoryLite, Transaction, TransactionDayGroup, TransactionView } from './types';

/**
 * @deprecated Import `CategoryLite` from `@/features/transactions/types`.
 * Re-exported here for one release so existing importers keep compiling.
 */
export type { CategoryLite } from './types';

/** Map one DB transaction to its presentational view, joining category data. */
export function toTransactionView(
  tx: Transaction,
  byId: Map<string, CategoryLite>,
  now: Date = new Date(),
  reasons: Map<string, string> = new Map(),
): TransactionView {
  const { name, icon, color } = categoryPresentation(
    tx.category_id ? byId.get(tx.category_id) : undefined,
  );
  const time = formatTime(new Date(tx.occurred_at ?? tx.created_at));
  return {
    id: tx.id,
    merchant: tx.merchant,
    meta: `${name} • ${time}`,
    amountCents: tx.amount_eur,
    icon,
    iconColor: color,
    isFlagged: tx.is_flagged,
    flagReason: tx.is_flagged ? reasons.get(tx.id) : undefined,
    isIncome: tx.kind === 'income',
  };
}

/** Group transactions into day buckets, newest day first, preserving input order within a day. */
export function groupTransactionsByDay(
  txs: Transaction[],
  categories: CategoryLite[],
  now: Date = new Date(),
  reasons: Map<string, string> = new Map(),
): TransactionDayGroup[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const sorted = [...txs].map((tx, idx) => ({ tx, idx })).sort((a, b) => {
    if (a.tx.date !== b.tx.date) return a.tx.date < b.tx.date ? 1 : -1; // date desc
    const aAt = a.tx.occurred_at ?? a.tx.created_at;
    const bAt = b.tx.occurred_at ?? b.tx.created_at;
    if (aAt !== bAt) return aAt < bAt ? 1 : -1; // newest first within a day
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
    group.items.push(toTransactionView(tx, byId, now, reasons));
  }
  return groups;
}

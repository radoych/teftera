import { monthAbbr } from '@/lib/dates';
import type { Transaction } from '@/features/transactions/types';

/** Total of amount_eur (cents) across the given transactions. */
export function sumCents(txs: Transaction[]): number {
  return txs.reduce((total, tx) => total + tx.amount_eur, 0);
}

export interface TrendMonth {
  label: string; // BG month abbreviation
  totalCents: number;
  fraction: number; // 0..1 of the tallest bar
  isCurrent: boolean;
}

/** Spend per calendar month for the last `monthsBack` months (oldest→newest). */
export function monthlyTrend(
  txs: Transaction[],
  monthsBack = 6,
  now: Date = new Date(),
): TrendMonth[] {
  const prefixes: string[] = [];
  const buckets: TrendMonth[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    prefixes.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-`);
    buckets.push({ label: monthAbbr(d.getMonth()), totalCents: 0, fraction: 0, isCurrent: i === 0 });
  }

  for (const tx of txs) {
    const idx = prefixes.findIndex((p) => tx.date.startsWith(p));
    if (idx !== -1) buckets[idx]!.totalCents += tx.amount_eur;
  }

  const max = Math.max(0, ...buckets.map((b) => b.totalCents));
  if (max > 0) for (const b of buckets) b.fraction = b.totalCents / max;
  return buckets;
}

export interface MerchantSpend {
  merchant: string;
  totalCents: number;
}

/** Merchants ranked by total spend desc (ties by name asc), top `n`. */
export function topMerchants(txs: Transaction[], n = 5): MerchantSpend[] {
  const totals = new Map<string, number>();
  for (const tx of txs) {
    totals.set(tx.merchant, (totals.get(tx.merchant) ?? 0) + tx.amount_eur);
  }
  return [...totals.entries()]
    .map(([merchant, totalCents]) => ({ merchant, totalCents }))
    .sort((a, b) => b.totalCents - a.totalCents || a.merchant.localeCompare(b.merchant))
    .slice(0, n);
}

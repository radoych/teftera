import type { SummaryInput } from '@/services/gemini';
import { categoryBreakdown, pctChange } from '@/features/transactions/dashboard';
import type { CategoryLite } from '@/features/transactions/groupByDay';
import type { Transaction } from '@/features/transactions/types';
import { sumCents, topMerchants } from './aggregate';
import { comparisonRange, filterByDateBounds, filterByRange } from './range';

/**
 * Build the compact current-month snapshot for the AI summary. Pass the already
 * household-scoped transactions; this fixes the window to the current calendar month.
 */
export function buildSummaryInput(
  txs: Transaction[],
  categories: CategoryLite[],
  now: Date = new Date(),
): SummaryInput {
  const monthTxs = filterByRange(txs, 'this_month', now);
  const c = comparisonRange('this_month', now);
  const prevTxs = filterByDateBounds(txs, c.startISO, c.endISO);

  const monthTotalCents = sumCents(monthTxs);
  const prevMonthTotalCents = sumCents(prevTxs);

  const top = categoryBreakdown(monthTxs, categories)[0];
  const merch = topMerchants(monthTxs, 1)[0];

  return {
    monthTotalCents,
    prevMonthTotalCents,
    pctChange: pctChange(monthTotalCents, prevMonthTotalCents),
    topCategory: top ? { name: top.name, totalCents: top.totalCents } : null,
    topMerchant: merch ? { merchant: merch.merchant, totalCents: merch.totalCents } : null,
  };
}

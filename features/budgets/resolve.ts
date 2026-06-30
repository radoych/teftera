import type { BudgetRow, ResolvedBudgets } from './types';

/**
 * Carry-forward resolution: for each category, pick the row matching `month`,
 * else the most recent row strictly before it. Rows after `month` are ignored.
 * `month` is a YYYY-MM-01 string; row.month uses the same format, so lexical
 * comparison is chronological.
 */
export function resolveBudgetsForMonth(rows: BudgetRow[], month: string): ResolvedBudgets {
  const best = new Map<string, BudgetRow>();
  for (const r of rows) {
    if (r.category_id === null) continue;
    if (r.month > month) continue;
    const current = best.get(r.category_id);
    if (!current || r.month > current.month) best.set(r.category_id, r);
  }
  const out: ResolvedBudgets = new Map();
  for (const [categoryId, r] of best) out.set(categoryId, r.amount_eur);
  return out;
}

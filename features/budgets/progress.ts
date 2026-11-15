import { colors } from '@/lib/theme';
import type { BudgetProgress, BudgetState, ResolvedBudgets } from './types';

/**
 * State keys off integer cents, NOT the rounded pct, so boundaries are exact:
 *  - over    : spent strictly exceeds budget (e.g. 10001 vs 10000 cents)
 *  - warning : spent is >= 80% of budget but not over
 *  - under   : otherwise
 * (Rounding pct for state would misclassify 100.01% as 100% → warning.)
 */
function stateFor(spentCents: number, budgetCents: number): BudgetState {
  if (budgetCents <= 0) return 'under';
  if (spentCents > budgetCents) return 'over';
  if (spentCents * 100 >= budgetCents * 80) return 'warning';
  return 'under';
}

/**
 * Compute spend-vs-budget for every budgeted category. `spend` is the
 * categoryBreakdown output (only `id` + `totalCents` are used). Categories with
 * no resolved budget are omitted. Sorted by pct descending.
 */
export function budgetProgress(
  resolved: ResolvedBudgets,
  spend: { id: string; totalCents: number }[],
): BudgetProgress[] {
  const spentById = new Map(spend.map((s) => [s.id, s.totalCents]));
  const rows: BudgetProgress[] = [];
  for (const [categoryId, budgetCents] of resolved) {
    const spentCents = spentById.get(categoryId) ?? 0;
    const pct = budgetCents > 0 ? Math.round((spentCents / budgetCents) * 100) : 0;
    rows.push({ categoryId, budgetCents, spentCents, pct, state: stateFor(spentCents, budgetCents) });
  }
  rows.sort((a, b) => b.pct - a.pct);
  return rows;
}

/** Progress-bar fill for a budget state: over → error, warning → tertiary, under → primary-container. */
export function budgetStateColor(state: BudgetState): string {
  if (state === 'over') return colors.error;
  if (state === 'warning') return colors.tertiary;
  return colors.primaryContainer;
}

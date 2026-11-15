// features/budgets/currentMonth.ts — the one budget-vs-actual selector.
import { spendingByCategory } from '@/features/transactions/dashboard';
import type { CategoryLite } from '@/features/transactions/groupByDay';
import { expensesOnly } from '@/features/transactions/kind';
import type { Transaction } from '@/features/transactions/types';
import { firstOfMonth } from '@/lib/dates';
import { budgetProgress } from './progress';
import { resolveBudgetsForMonth } from './resolve';
import type { BudgetProgress, BudgetRow } from './types';

/**
 * Budget progress for the calendar month containing `month`, against an
 * already-computed per-category spend (e.g. a `categoryBreakdown` result the
 * caller also renders). Use this when the spend rows are needed anyway.
 */
export function monthBudgetProgress(
  budgets: BudgetRow[],
  spend: { id: string; totalCents: number }[],
  month: Date,
): BudgetProgress[] {
  return budgetProgress(resolveBudgetsForMonth(budgets, firstOfMonth(month)), spend);
}

export interface CurrentMonthBudgetInput {
  /** Household transactions; income rows are ignored. */
  transactions: Transaction[];
  categories: CategoryLite[];
  budgets: BudgetRow[];
  now?: Date;
}

/**
 * Household spend vs carried-forward budgets for the month containing `now`.
 * Expenses only; categories without a resolved budget are omitted; sorted by
 * pct descending.
 */
export function currentMonthBudgetProgress(input: CurrentMonthBudgetInput): BudgetProgress[] {
  const now = input.now ?? new Date();
  const spend = spendingByCategory(expensesOnly(input.transactions), input.categories, now);
  return monthBudgetProgress(input.budgets, spend, now);
}

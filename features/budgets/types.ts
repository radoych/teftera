import type { Tables } from '@/supabase/types';

/**
 * The budget columns the app selects (see `fetchBudgets`), derived from the
 * generated `budgets` Row. `amount_eur` is euro cents; `month` is YYYY-MM-01.
 */
export type BudgetRow = Pick<
  Tables<'budgets'>,
  'id' | 'household_id' | 'category_id' | 'amount_eur' | 'month'
>;

export type ResolvedBudgets = Map<string, number>; // categoryId -> amountCents

export type BudgetState = 'under' | 'warning' | 'over';

export interface BudgetProgress {
  categoryId: string;
  budgetCents: number;
  spentCents: number;
  pct: number; // 0..(>100), spent/budget * 100, rounded
  state: BudgetState;
}

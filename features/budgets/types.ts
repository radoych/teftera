export interface BudgetRow {
  id: string;
  household_id: string;
  category_id: string | null;
  amount_eur: number; // euro cents
  month: string; // YYYY-MM-01
}

export type ResolvedBudgets = Map<string, number>; // categoryId -> amountCents

export type BudgetState = 'under' | 'warning' | 'over';

export interface BudgetProgress {
  categoryId: string;
  budgetCents: number;
  spentCents: number;
  pct: number; // 0..(>100), spent/budget * 100, rounded
  state: BudgetState;
}

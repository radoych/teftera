// features/transactions/kind.ts — the single choke point for expense/income splits.
export type TxKind = 'expense' | 'income';

interface HasKind {
  kind: TxKind;
}

export function expensesOnly<T extends HasKind>(rows: T[]): T[] {
  return rows.filter((r) => r.kind === 'expense');
}

export function incomeOnly<T extends HasKind>(rows: T[]): T[] {
  return rows.filter((r) => r.kind === 'income');
}

/** Same predicates, named for category lists. */
export const expenseCategories = expensesOnly;
export const incomeCategories = incomeOnly;

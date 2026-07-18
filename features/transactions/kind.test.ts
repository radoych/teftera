import { expensesOnly, incomeOnly, expenseCategories, incomeCategories } from './kind';

const rows = [
  { id: 'a', kind: 'expense' as const },
  { id: 'b', kind: 'income' as const },
  { id: 'c', kind: 'expense' as const },
];

describe('kind helpers', () => {
  it('expensesOnly keeps only expenses', () => {
    expect(expensesOnly(rows).map((r) => r.id)).toEqual(['a', 'c']);
  });
  it('incomeOnly keeps only income', () => {
    expect(incomeOnly(rows).map((r) => r.id)).toEqual(['b']);
  });
  it('category aliases behave identically', () => {
    expect(expenseCategories(rows)).toEqual(expensesOnly(rows));
    expect(incomeCategories(rows)).toEqual(incomeOnly(rows));
  });
  it('empty input → empty output', () => {
    expect(expensesOnly([])).toEqual([]);
  });
});

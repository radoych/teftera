import { resolveBudgetsForMonth } from './resolve';
import type { BudgetRow } from './types';

const row = (category_id: string, amount_eur: number, month: string): BudgetRow => ({
  id: `${category_id}-${month}`,
  household_id: 'h1',
  category_id,
  amount_eur,
  month,
});

describe('resolveBudgetsForMonth', () => {
  it('returns the exact current-month row when present', () => {
    const rows = [row('groceries', 20000, '2026-06-01')];
    expect(resolveBudgetsForMonth(rows, '2026-06-01').get('groceries')).toBe(20000);
  });

  it('carries forward the most recent prior month when none exists for the target', () => {
    const rows = [row('groceries', 20000, '2026-04-01'), row('groceries', 25000, '2026-05-01')];
    expect(resolveBudgetsForMonth(rows, '2026-06-01').get('groceries')).toBe(25000);
  });

  it('prefers the exact month over an earlier one', () => {
    const rows = [row('groceries', 20000, '2026-05-01'), row('groceries', 30000, '2026-06-01')];
    expect(resolveBudgetsForMonth(rows, '2026-06-01').get('groceries')).toBe(30000);
  });

  it('ignores rows from future months', () => {
    const rows = [row('groceries', 20000, '2026-07-01')];
    expect(resolveBudgetsForMonth(rows, '2026-06-01').has('groceries')).toBe(false);
  });

  it('returns no entry for a category with no budget at or before the target', () => {
    expect(resolveBudgetsForMonth([], '2026-06-01').size).toBe(0);
  });

  it('skips rows with a null category_id', () => {
    const rows: BudgetRow[] = [{ id: 'x', household_id: 'h1', category_id: null, amount_eur: 100, month: '2026-06-01' }];
    expect(resolveBudgetsForMonth(rows, '2026-06-01').size).toBe(0);
  });
});

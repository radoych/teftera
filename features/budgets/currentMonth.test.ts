import type { CategoryLite, Transaction } from '@/features/transactions/types';
import { spendingByCategory } from '@/features/transactions/dashboard';
import { expensesOnly } from '@/features/transactions/kind';
import { firstOfMonth } from '@/lib/dates';
import { currentMonthBudgetProgress, monthBudgetProgress } from './currentMonth';
import { budgetProgress } from './progress';
import { resolveBudgetsForMonth } from './resolve';
import type { BudgetRow } from './types';

const NOW = new Date(2026, 5, 15); // 15 Jun 2026, local

const cats: CategoryLite[] = [
  { id: 'groc', name: 'Groceries', icon: 'shopping-basket', color: '#adc7ff', kind: 'expense' },
  { id: 'fun', name: 'Entertainment', icon: 'movie', color: '#d8e3ff', kind: 'expense' },
  { id: 'pay', name: 'Заплата', icon: 'payments', color: '#d8e3ff', kind: 'income' },
];

function tx(p: Partial<Transaction> & { id: string }): Transaction {
  return {
    household_id: 'h', user_id: 'u', amount_eur: 1000,
    original_amount: null, original_currency: null, merchant: 'M',
    category_id: 'groc', date: '2026-06-10', note: null, source: 'manual', kind: 'expense',
    receipt_id: null, is_flagged: false, occurred_at: null,
    created_at: '2026-06-10T00:00:00.000Z', ...p,
  };
}

const budgets: BudgetRow[] = [
  { id: 'b1', household_id: 'h', category_id: 'groc', amount_eur: 20000, month: '2026-05-01' }, // carried forward
  { id: 'b2', household_id: 'h', category_id: 'fun', amount_eur: 5000, month: '2026-06-01' },
  { id: 'b3', household_id: 'h', category_id: 'fun', amount_eur: 9999, month: '2026-07-01' }, // future, ignored
];

const transactions: Transaction[] = [
  tx({ id: '1', category_id: 'groc', amount_eur: 16000, date: '2026-06-02' }),
  tx({ id: '2', category_id: 'fun', amount_eur: 6000, date: '2026-06-30' }),
  tx({ id: '3', category_id: 'groc', amount_eur: 50000, date: '2026-05-31' }), // previous month
  tx({ id: '4', category_id: 'pay', amount_eur: 300000, date: '2026-06-01', kind: 'income' }),
  tx({ id: '5', category_id: 'groc', amount_eur: 99999, date: '2026-06-05', kind: 'income' }), // income never counts
];

describe('currentMonthBudgetProgress', () => {
  it('pins the output for a mixed month (carry-forward, over, income ignored)', () => {
    expect(currentMonthBudgetProgress({ transactions, categories: cats, budgets, now: NOW })).toEqual([
      { categoryId: 'fun', budgetCents: 5000, spentCents: 6000, pct: 120, state: 'over' },
      { categoryId: 'groc', budgetCents: 20000, spentCents: 16000, pct: 80, state: 'warning' },
    ]);
  });

  it('matches the hand-assembled pipeline it replaces', () => {
    const handRolled = budgetProgress(
      resolveBudgetsForMonth(budgets, firstOfMonth(NOW)),
      spendingByCategory(expensesOnly(transactions), cats, NOW),
    );
    expect(currentMonthBudgetProgress({ transactions, categories: cats, budgets, now: NOW })).toEqual(handRolled);
  });

  it('returns an empty list when nothing is budgeted', () => {
    expect(currentMonthBudgetProgress({ transactions, categories: cats, budgets: [], now: NOW })).toEqual([]);
  });

  it('defaults `now` to the current date', () => {
    const today = new Date();
    const rows = currentMonthBudgetProgress({
      transactions: [tx({ id: 'x', amount_eur: 100, date: firstOfMonth(today) })],
      categories: cats,
      budgets: [{ id: 'b', household_id: 'h', category_id: 'groc', amount_eur: 1000, month: firstOfMonth(today) }],
    });
    expect(rows).toEqual([{ categoryId: 'groc', budgetCents: 1000, spentCents: 100, pct: 10, state: 'under' }]);
  });
});

describe('monthBudgetProgress', () => {
  it('resolves budgets for the month of `month` against a precomputed spend', () => {
    const spend = [{ id: 'groc', totalCents: 21000 }];
    expect(monthBudgetProgress(budgets, spend, new Date(2026, 4, 20))).toEqual([
      { categoryId: 'groc', budgetCents: 20000, spentCents: 21000, pct: 105, state: 'over' },
    ]);
  });
});

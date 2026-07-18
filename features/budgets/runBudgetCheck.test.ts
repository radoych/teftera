// features/budgets/runBudgetCheck.test.ts
import { runBudgetCheck } from './runBudgetCheck';
import type { BudgetRow } from './types';
import type { Transaction } from '@/features/transactions/types';

const NOW = new Date('2026-06-15T12:00:00Z');
const cats = [{ id: 'groceries', name: 'Хранителни стоки', icon: 'shopping-cart', color: '#fff' }] as any;
const budget: BudgetRow = { id: 'b1', household_id: 'h1', category_id: 'groceries', amount_eur: 20000, month: '2026-06-01' };

function tx(amount: number): Transaction {
  return {
    id: Math.random().toString(), household_id: 'h1', user_id: 'u1', amount_eur: amount,
    original_amount: null, original_currency: null, merchant: 'Kaufland', category_id: 'groceries',
    date: '2026-06-10', note: null, source: 'manual', kind: 'expense', receipt_id: null, is_flagged: false,
    occurred_at: null, created_at: '2026-06-10T00:00:00Z',
  };
}

function makeDeps(alreadyAlerted = false) {
  return {
    hasAlerted: jest.fn().mockResolvedValue(alreadyAlerted),
    recordAlerted: jest.fn().mockResolvedValue(undefined),
    notify: jest.fn().mockResolvedValue(undefined),
  };
}

describe('runBudgetCheck', () => {
  it('does nothing when alerts are disabled', async () => {
    const deps = makeDeps();
    await runBudgetCheck({ householdId: 'h1', savedCategoryId: 'groceries', alertsEnabled: false, transactions: [tx(16000)], categories: cats, budgets: [budget], now: NOW }, deps);
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it('does nothing when below 80%', async () => {
    const deps = makeDeps();
    await runBudgetCheck({ householdId: 'h1', savedCategoryId: 'groceries', alertsEnabled: true, transactions: [tx(15999)], categories: cats, budgets: [budget], now: NOW }, deps);
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it('notifies and records when crossing 80%', async () => {
    const deps = makeDeps(false);
    await runBudgetCheck({ householdId: 'h1', savedCategoryId: 'groceries', alertsEnabled: true, transactions: [tx(16000)], categories: cats, budgets: [budget], now: NOW }, deps);
    expect(deps.notify).toHaveBeenCalledTimes(1);
    expect(deps.recordAlerted).toHaveBeenCalledWith('budgetAlert:h1:groceries:2026-06-01:80');
  });

  it('does not re-notify when the 80 marker already exists', async () => {
    const deps = makeDeps(true);
    await runBudgetCheck({ householdId: 'h1', savedCategoryId: 'groceries', alertsEnabled: true, transactions: [tx(16000)], categories: cats, budgets: [budget], now: NOW }, deps);
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it('fires the 100 threshold when over budget', async () => {
    const deps = makeDeps(false);
    await runBudgetCheck({ householdId: 'h1', savedCategoryId: 'groceries', alertsEnabled: true, transactions: [tx(20001)], categories: cats, budgets: [budget], now: NOW }, deps);
    expect(deps.recordAlerted).toHaveBeenCalledWith('budgetAlert:h1:groceries:2026-06-01:100');
  });

  it('does nothing for a category with no budget', async () => {
    const deps = makeDeps();
    await runBudgetCheck({ householdId: 'h1', savedCategoryId: 'groceries', alertsEnabled: true, transactions: [tx(16000)], categories: cats, budgets: [], now: NOW }, deps);
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it('never throws when a dep rejects', async () => {
    const deps = { hasAlerted: jest.fn().mockRejectedValue(new Error('x')), recordAlerted: jest.fn(), notify: jest.fn() };
    await expect(
      runBudgetCheck({ householdId: 'h1', savedCategoryId: 'groceries', alertsEnabled: true, transactions: [tx(16000)], categories: cats, budgets: [budget], now: NOW }, deps as any),
    ).resolves.toBeUndefined();
  });
});

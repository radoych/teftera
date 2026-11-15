import { runAfterSave, type AfterSaveDeps, type AfterSaveInput, type AfterSaveSnapshot } from './afterSave';
import type { Transaction } from './types';

const TX = { id: 't1' } as unknown as Transaction;

const snapshot: AfterSaveSnapshot = {
  transactions: [TX],
  categories: [],
  budgets: [],
  anomalyAlertsEnabled: true,
  budgetAlertsEnabled: false,
};

const newExpense: AfterSaveInput = {
  householdId: 'h1',
  transactionId: 't1',
  kind: 'expense',
  amountCents: 1250,
  categoryId: 'groceries',
  merchant: 'Lidl',
};

function makeDeps(overrides: Partial<AfterSaveDeps> = {}) {
  const calls: string[] = [];
  const deps = {
    refresh: jest.fn(async () => {
      calls.push('refresh');
    }),
    snapshot: jest.fn(() => {
      calls.push('snapshot');
      return snapshot;
    }),
    detect: jest.fn(async () => {
      calls.push('detect');
    }),
    budgetCheck: jest.fn(async () => {
      calls.push('budgetCheck');
    }),
    ...overrides,
  } satisfies AfterSaveDeps;
  return { deps, calls };
}

describe('runAfterSave', () => {
  it('refreshes, then reads the store snapshot, then runs detection and the budget check', async () => {
    const { deps, calls } = makeDeps();
    await runAfterSave(newExpense, deps);
    expect(calls).toEqual(['refresh', 'snapshot', 'detect', 'budgetCheck']);
    expect(deps.refresh).toHaveBeenCalledWith('h1');
  });

  it('feeds detection the post-refresh snapshot and the anomaly preference', async () => {
    const { deps } = makeDeps();
    await runAfterSave(newExpense, deps);
    expect(deps.detect).toHaveBeenCalledWith({
      transactionId: 't1',
      householdId: 'h1',
      amountCents: 1250,
      categoryId: 'groceries',
      transactions: [TX],
      merchant: 'Lidl',
      alertsEnabled: true,
    });
  });

  it('feeds the budget check the snapshot and the budget preference', async () => {
    const { deps } = makeDeps();
    await runAfterSave(newExpense, deps);
    expect(deps.budgetCheck).toHaveBeenCalledWith({
      householdId: 'h1',
      savedCategoryId: 'groceries',
      alertsEnabled: false,
      transactions: [TX],
      categories: [],
      budgets: [],
    });
  });

  it('only refreshes after an edit (no transactionId)', async () => {
    const { deps, calls } = makeDeps();
    await runAfterSave({ ...newExpense, transactionId: null }, deps);
    expect(calls).toEqual(['refresh']);
  });

  it('only refreshes after saving income — detection and budgets are expense rules', async () => {
    const { deps, calls } = makeDeps();
    await runAfterSave({ ...newExpense, kind: 'income' }, deps);
    expect(calls).toEqual(['refresh']);
  });

  it('never throws, and skips the store-dependent steps when the refresh fails', async () => {
    const { deps } = makeDeps({
      refresh: jest.fn(async () => {
        throw new Error('offline');
      }),
    });
    await expect(runAfterSave(newExpense, deps)).resolves.toBeUndefined();
    expect(deps.detect).not.toHaveBeenCalled();
    expect(deps.budgetCheck).not.toHaveBeenCalled();
  });

  it('a failing step does not stop the next one', async () => {
    const { deps } = makeDeps({
      detect: jest.fn(async () => {
        throw new Error('boom');
      }),
    });
    await expect(runAfterSave(newExpense, deps)).resolves.toBeUndefined();
    expect(deps.budgetCheck).toHaveBeenCalledTimes(1);
  });
});

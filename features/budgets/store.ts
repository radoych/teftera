// features/budgets/store.ts
import { create } from 'zustand';
import { fetchBudgets } from './api';
import type { BudgetRow } from './types';

interface BudgetsState {
  rows: BudgetRow[];
  loaded: boolean;
  setRows: (rows: BudgetRow[]) => void;
  reset: () => void;
}

export const useBudgetsStore = create<BudgetsState>((set) => ({
  rows: [],
  loaded: false,
  setRows: (rows) => set({ rows, loaded: true }),
  reset: () => set({ rows: [], loaded: false }),
}));

/** Best-effort load into the store; a failure leaves prior rows intact. */
export async function loadBudgets(householdId: string): Promise<void> {
  try {
    const rows = await fetchBudgets(householdId);
    useBudgetsStore.getState().setRows(rows);
  } catch (err) {
    if (__DEV__) console.warn('[budgets] load failed', err);
  }
}

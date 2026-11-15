// features/transactions/sync.ts — load + live-sync of the household's transactions.
import { listOpenAnomalies } from '@/features/anomalies/api';
import { loadBudgets, useBudgetsStore } from '@/features/budgets/store';
import { createHouseholdSync } from '@/features/sync/householdSync';
import { useHouseholdSync } from '@/features/sync/useHouseholdSync';
import { listCategories, listTransactions } from './api';
import { useTransactionsStore } from './store';

/**
 * Categories + transactions + open anomalies, kept live from the
 * `transactions` realtime channel. On any change we refetch rather than decode
 * individual payloads (we trust RLS + a fresh query — robust and simple for a
 * two-person household). Reloads are coalesced; see `createHouseholdSync`.
 *
 * Budgets are deliberately NOT reloaded here: a transaction change cannot
 * change a budget row. They load once per household mount and again after the
 * budgets screen saves.
 */
export const transactionsSync = createHouseholdSync({
  label: 'transactions',
  tables: ['transactions'],
  load: (householdId) =>
    Promise.all([
      listCategories(householdId),
      listTransactions(householdId),
      listOpenAnomalies(householdId),
    ]),
  apply: ([categories, transactions, openAnomalies]) =>
    useTransactionsStore.getState().setData(transactions, categories, openAnomalies),
  reset: () => {
    useTransactionsStore.getState().reset();
    useBudgetsStore.getState().reset();
  },
  onStart: (householdId) => {
    useTransactionsStore.getState().setLoading(true);
    void loadBudgets(householdId);
  },
  onError: () => useTransactionsStore.getState().setLoading(false),
});

/**
 * Fetch the household's categories + transactions + open anomalies into the
 * store. Resolves once the store holds data fetched after this call — safe to
 * await right after a write. Rejects if that fetch fails.
 */
export const refreshTransactions = (householdId: string): Promise<void> =>
  transactionsSync.refresh(householdId);

/** Keep the household's transactions live. Call once, in the (app) layout. */
export function useTransactionsSync(): void {
  useHouseholdSync(transactionsSync);
}

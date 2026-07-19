// features/transactions/sync.ts — single realtime subscription for the app.
import { useEffect } from 'react';
import { supabase } from '@/services/supabase';
import { useAuthStore } from '@/features/auth/store';
import { listOpenAnomalies } from '@/features/anomalies/api';
import { loadBudgets, useBudgetsStore } from '@/features/budgets/store';
import { trailingDebounce } from '@/lib/debounce';
import { listCategories, listTransactions } from './api';
import { subscribeToTransactions } from './realtimeChannel';
import { useTransactionsStore } from './store';

/** Fetch the household's categories + transactions + open anomalies into the store. */
export async function refreshTransactions(householdId: string): Promise<void> {
  const [categories, transactions, openAnomalies] = await Promise.all([
    listCategories(householdId),
    listTransactions(householdId),
    listOpenAnomalies(householdId),
  ]);
  useTransactionsStore.getState().setData(transactions, categories, openAnomalies);
}

/**
 * Load the household's transactions + categories into the store and keep them
 * live. On any change to the household's transactions, refetch the list (we
 * trust RLS + a fresh query over decoding individual payloads — robust and
 * simple for a two-person household). Call once, in the (app) layout.
 */
export function useTransactionsSync(): void {
  const householdId = useAuthStore((s) => s.householdId);

  useEffect(() => {
    if (!householdId) {
      useTransactionsStore.getState().reset();
      useBudgetsStore.getState().reset();
      return;
    }

    let active = true;
    const store = useTransactionsStore.getState();

    async function load() {
      try {
        await refreshTransactions(householdId!);
        void loadBudgets(householdId!);
      } catch (err) {
        if (__DEV__) console.warn('[transactions] load failed', err);
        if (active) store.setLoading(false);
      }
    }

    store.setLoading(true);
    load();

    const reload = trailingDebounce(() => void load(), 400);
    const unsubscribe = subscribeToTransactions(supabase, householdId, () => reload.call());

    return () => {
      active = false;
      reload.cancel();
      unsubscribe();
    };
  }, [householdId]);
}

// features/transactions/sync.ts — single realtime subscription for the app.
import { useEffect } from 'react';
import { supabase } from '@/services/supabase';
import { useAuthStore } from '@/features/auth/store';
import { listCategories, listTransactions } from './api';
import { subscribeToTransactions } from './realtimeChannel';
import { useTransactionsStore } from './store';

/** Fetch the household's categories + transactions and write them into the store. */
export async function refreshTransactions(householdId: string): Promise<void> {
  const [categories, transactions] = await Promise.all([
    listCategories(householdId),
    listTransactions(householdId),
  ]);
  useTransactionsStore.getState().setData(transactions, categories);
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
      return;
    }

    let active = true;
    const store = useTransactionsStore.getState();

    async function load() {
      try {
        await refreshTransactions(householdId!);
      } catch (err) {
        if (__DEV__) console.warn('[transactions] load failed', err);
        if (active) store.setLoading(false);
      }
    }

    store.setLoading(true);
    load();

    const unsubscribe = subscribeToTransactions(supabase, householdId, () => load());

    return () => {
      active = false;
      unsubscribe();
    };
  }, [householdId]);
}

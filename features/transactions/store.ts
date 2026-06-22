import { create } from 'zustand';
import type { CategoryLite } from './groupByDay';
import type { Transaction } from './types';

interface TransactionsState {
  transactions: Transaction[];
  categories: CategoryLite[];
  loading: boolean;
  loaded: boolean;
  setData: (transactions: Transaction[], categories: CategoryLite[]) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useTransactionsStore = create<TransactionsState>((set) => ({
  transactions: [],
  categories: [],
  loading: false,
  loaded: false,
  setData: (transactions, categories) =>
    set({ transactions, categories, loading: false, loaded: true }),
  setLoading: (loading) => set({ loading }),
  reset: () => set({ transactions: [], categories: [], loading: false, loaded: false }),
}));

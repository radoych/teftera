import { create } from 'zustand';
import type { OpenAnomaly } from '@/features/anomalies/api';
import type { CategoryLite } from './groupByDay';
import type { Transaction } from './types';

interface TransactionsState {
  transactions: Transaction[];
  categories: CategoryLite[];
  openAnomalies: OpenAnomaly[];
  loading: boolean;
  loaded: boolean;
  setData: (
    transactions: Transaction[],
    categories: CategoryLite[],
    openAnomalies: OpenAnomaly[],
  ) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useTransactionsStore = create<TransactionsState>((set) => ({
  transactions: [],
  categories: [],
  openAnomalies: [],
  loading: true,
  loaded: false,
  setData: (transactions, categories, openAnomalies) =>
    set({ transactions, categories, openAnomalies, loading: false, loaded: true }),
  setLoading: (loading) => set({ loading }),
  reset: () =>
    set({ transactions: [], categories: [], openAnomalies: [], loading: false, loaded: false }),
}));

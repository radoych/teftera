import { create } from 'zustand';
import type { LoyaltyCard } from './types';

interface LoyaltyState {
  cards: LoyaltyCard[];
  /** True once the first load for the current household has landed. */
  loaded: boolean;
  setCards: (cards: LoyaltyCard[]) => void;
  reset: () => void;
}

export const useLoyaltyStore = create<LoyaltyState>((set) => ({
  cards: [],
  loaded: false,
  setCards: (cards) => set({ cards, loaded: true }),
  reset: () => set({ cards: [], loaded: false }),
}));

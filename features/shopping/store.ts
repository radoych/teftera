// features/shopping/store.ts — the household's shopping lists + items, as the UI sees them.
//
// `lists` / `items` are the OVERLAID view (server rows + pending optimistic
// ops, see ./optimistic.ts). Only the engine in ./sync.ts writes them — call
// the mutators in ./mutations.ts, never `setState` directly.
import { create } from 'zustand';
import type { ShoppingList, ShoppingListItem } from './types';

interface ShoppingState {
  lists: ShoppingList[];
  items: ShoppingListItem[];
  /** True once the first load for the current household has landed. */
  loaded: boolean;
}

export const useShoppingStore = create<ShoppingState>(() => ({
  lists: [],
  items: [],
  loaded: false,
}));

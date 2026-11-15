// features/shopping/sync.ts — load + live-sync of lists and items, with the optimistic engine.
import { useMemo } from 'react';
import { useAuthStore } from '@/features/auth/store';
import { createHouseholdSync } from '@/features/sync/householdSync';
import { useHouseholdSync } from '@/features/sync/useHouseholdSync';
import { haptics } from '@/lib/haptics';
import { listItems, listLists } from './api';
import { itemsByList, listCounts } from './order';
import { createOptimisticEngine, type ShoppingData } from './optimistic';
import { useShoppingStore } from './store';
import type { ListCounts, ShoppingList, ShoppingListItem } from './types';

/** Server rows + pending optimistic ops → the store (see ./optimistic.ts). */
export const shoppingEngine = createOptimisticEngine({
  publish: ({ lists, items }) => useShoppingStore.setState({ lists, items }),
  refresh: () => {
    const householdId = useAuthStore.getState().householdId;
    if (householdId) shoppingSync.refresh(householdId).catch(() => {});
  },
  onError: (err, op) => {
    if (__DEV__) console.warn(`[shopping] ${op.kind} failed — reverted`, err);
    haptics.error();
  },
});

/**
 * Two realtime channels (`shopping_lists`, `shopping_list_items`) funnel into
 * one debounced reload. `load` reads the engine's commit clock before it
 * fetches (no store access) so `apply` knows which optimistic ops the result
 * is guaranteed to contain.
 */
export const shoppingSync = createHouseholdSync<ShoppingData & { mark: number }>({
  label: 'shopping',
  tables: ['shopping_lists', 'shopping_list_items'],
  load: async (householdId) => {
    const mark = shoppingEngine.mark();
    const [lists, items] = await Promise.all([listLists(householdId), listItems(householdId)]);
    return { lists, items, mark };
  },
  apply: ({ lists, items, mark }) => {
    shoppingEngine.setServer({ lists, items }, mark);
    useShoppingStore.setState({ loaded: true });
  },
  reset: () => {
    shoppingEngine.reset();
    useShoppingStore.setState({ loaded: false });
  },
});

/** Reload lists + items; resolves once the store holds data fetched after this call. */
export const refreshShopping = (householdId: string): Promise<void> =>
  shoppingSync.refresh(householdId);

/** Keep the household's shopping lists live. Call once, in the (app) layout. */
export function useShoppingSync(): void {
  useHouseholdSync(shoppingSync);
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

const NO_ITEMS: ShoppingListItem[] = [];

/** One list (undefined = missing / not loaded). */
export function useShoppingList(id: string | undefined): ShoppingList | undefined {
  return useShoppingStore((s) => (id ? s.lists.find((l) => l.id === id) : undefined));
}

/** One list's items (unsorted — run them through `splitItems`). */
export function useListItems(listId: string | undefined): ShoppingListItem[] {
  const items = useShoppingStore((s) => s.items);
  return useMemo(
    () => (listId ? items.filter((i) => i.list_id === listId) : NO_ITEMS),
    [items, listId],
  );
}

/** Per-list counts for every list. */
export function useListCounts(): Map<string, ListCounts> {
  const items = useShoppingStore((s) => s.items);
  return useMemo(() => {
    const counts = new Map<string, ListCounts>();
    for (const [listId, listed] of itemsByList(items)) counts.set(listId, listCounts(listed));
    return counts;
  }, [items]);
}

/** vendor id → its list (decision #8: at most one). */
export function useListsByVendor(): Map<string, ShoppingList> {
  const lists = useShoppingStore((s) => s.lists);
  return useMemo(() => {
    const map = new Map<string, ShoppingList>();
    for (const l of lists) if (l.vendor_id) map.set(l.vendor_id, l);
    return map;
  }, [lists]);
}

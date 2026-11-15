// features/shopping/hooks.ts — React selectors that join lists with vendors and cards.
import { useMemo } from 'react';
import { useLoyaltyStore } from '@/features/loyalty/store';
import { useVendorsStore } from '@/features/vendors/store';
import { useShoppingStore } from './store';
import type { ShoppingListView } from './types';
import { buildListViews } from './views';

/** Every list as a sorted row model (index screen, dashboard). */
export function useListViews(): ShoppingListView[] {
  const lists = useShoppingStore((s) => s.lists);
  const items = useShoppingStore((s) => s.items);
  const vendors = useVendorsStore((s) => s.vendors);
  const cards = useLoyaltyStore((s) => s.cards);

  return useMemo(() => {
    const vendorNames = new Map(vendors.map((v) => [v.id, v.name]));
    const nicknames = new Map(cards.map((c) => [c.id, c.nickname]));
    return buildListViews(
      lists,
      items,
      (id) => vendorNames.get(id),
      (id) => nicknames.get(id),
    );
  }, [lists, items, vendors, cards]);
}

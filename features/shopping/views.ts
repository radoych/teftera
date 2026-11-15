// features/shopping/views.ts — lists → rows for the index and dashboard. Pure.
import { itemsByList, listCounts, sortLists } from './order';
import type { ShoppingList, ShoppingListItem, ShoppingListView } from './types';

/** id → display string; undefined = unknown (deleted / not loaded). */
export type NameLookup = (id: string) => string | undefined;

/**
 * Sorted (`sortLists`) row models. The title follows the vendor's current
 * name (renames show up), falling back to the list's snapshot name when the
 * vendor is gone; a card that no longer resolves renders as no card.
 */
export function buildListViews(
  lists: readonly ShoppingList[],
  items: readonly ShoppingListItem[],
  vendorName: NameLookup,
  cardNickname: NameLookup,
): ShoppingListView[] {
  const grouped = itemsByList(items);
  return sortLists(lists, items).map((list) => ({
    list,
    counts: listCounts(grouped.get(list.id) ?? []),
    title: (list.vendor_id ? vendorName(list.vendor_id) : undefined) ?? list.name,
    cardNickname: (list.loyalty_card_id ? cardNickname(list.loyalty_card_id) : undefined) ?? null,
  }));
}

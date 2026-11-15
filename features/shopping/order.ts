// features/shopping/order.ts — grouping / ordering / counting of lists and items. Pure.
import type { ListCounts, ShoppingList, ShoppingListItem } from './types';

const byPosition = (a: ShoppingListItem, b: ShoppingListItem): number =>
  a.position - b.position ||
  a.created_at.localeCompare(b.created_at) ||
  a.id.localeCompare(b.id);

/** ISO timestamps compare correctly as strings; newest first. */
const newestFirst = (a: string, b: string): number => b.localeCompare(a);

/**
 * Split one list's items into the open group (position order) and the "Взети"
 * group (most recently taken first). An item counts as done only when it is
 * checked AND not settling — a just-checked row stays in place under the
 * finger for a beat before it regroups (spec decision #12).
 */
export function splitItems(
  items: readonly ShoppingListItem[],
  settlingIds: ReadonlySet<string>,
): { open: ShoppingListItem[]; done: ShoppingListItem[] } {
  const open: ShoppingListItem[] = [];
  const done: ShoppingListItem[] = [];
  for (const item of items) {
    if (item.checked_at !== null && !settlingIds.has(item.id)) done.push(item);
    else open.push(item);
  }
  open.sort(byPosition);
  done.sort(
    (a, b) => newestFirst(a.checked_at ?? '', b.checked_at ?? '') || a.id.localeCompare(b.id),
  );
  return { open, done };
}

/** Position for a new item: one past the largest, 0 for an empty list. */
export function nextPosition(items: readonly ShoppingListItem[]): number {
  let max = -1;
  for (const item of items) if (item.position > max) max = item.position;
  return max + 1;
}

export function listCounts(items: readonly ShoppingListItem[]): ListCounts {
  let done = 0;
  for (const item of items) if (item.checked_at !== null) done += 1;
  return { total: items.length, open: items.length - done, done };
}

/** All items of a household grouped by `list_id` (input order kept). */
export function itemsByList(
  items: readonly ShoppingListItem[],
): Map<string, ShoppingListItem[]> {
  const map = new Map<string, ShoppingListItem[]>();
  for (const item of items) {
    const bucket = map.get(item.list_id);
    if (bucket) bucket.push(item);
    else map.set(item.list_id, [item]);
  }
  return map;
}

/** 0 = has open items · 1 = everything taken · 2 = empty. */
function bucket(counts: ListCounts): number {
  if (counts.open > 0) return 0;
  return counts.total > 0 ? 1 : 2;
}

/**
 * Lists with something left to take first, then fully taken lists, then empty
 * ones; within each group the most recently touched (`updated_at`) first.
 */
export function sortLists(
  lists: readonly ShoppingList[],
  items: readonly ShoppingListItem[],
): ShoppingList[] {
  const grouped = itemsByList(items);
  const rank = new Map(lists.map((l) => [l.id, bucket(listCounts(grouped.get(l.id) ?? []))]));
  return [...lists].sort(
    (a, b) =>
      (rank.get(a.id) ?? 2) - (rank.get(b.id) ?? 2) ||
      newestFirst(a.updated_at, b.updated_at) ||
      a.id.localeCompare(b.id),
  );
}

// features/shopping/types.ts — the app's shopping-list contract (spec 2026-09-09 §8).
import type { Tables } from '@/supabase/types';

/** One shopping list. `vendor_id` null = its vendor was deleted ("Без търговец"). */
export type ShoppingList = Tables<'shopping_lists'>;

/** One item on a list. `checked_at` non-null = taken ("Взети"). */
export type ShoppingListItem = Tables<'shopping_list_items'>;

export interface ListCounts {
  total: number;
  /** Not yet taken. */
  open: number;
  /** Taken (`checked_at` set). */
  done: number;
}

/** A list with what the index / dashboard rows need to render it. */
export interface ShoppingListView {
  list: ShoppingList;
  counts: ListCounts;
  /** The vendor's current name, falling back to the list's snapshot name. */
  title: string;
  /** Nickname of the attached loyalty card; null = no card. */
  cardNickname: string | null;
}

/** A parsed quick-add line. */
export interface QuickAddDraft {
  name: string;
  quantity: string | null;
}

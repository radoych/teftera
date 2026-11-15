// features/shopping/api.ts — the ONLY module that reads/writes `shopping_lists` / `shopping_list_items`.
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';
import type { ShoppingDatabase } from './dbTypes';
import type { ShoppingList, ShoppingListItem } from './types';

/**
 * TEMPORARY cast — the one place shopping code steps outside the generated
 * types. `supabase/types.ts` does not know the shopping tables until it is
 * regenerated after the migration is applied; until then this view of the same
 * client is typed by the hand-written `ShoppingDatabase` (./dbTypes.ts).
 * Replace `db` with `supabase` (and delete dbTypes.ts) once regenerated.
 */
const db = supabase as unknown as SupabaseClient<ShoppingDatabase>;

/** Explicit column lists — never select('*'). Literals so postgrest-js can type them. */
const LIST_COLUMNS =
  'id, household_id, vendor_id, name, loyalty_card_id, created_by, created_at, updated_at' as const;
const ITEM_COLUMNS =
  'id, household_id, list_id, name, quantity, position, checked_at, checked_by, created_by, created_at' as const;

/** The household's lists, most recently touched first. */
export async function listLists(householdId: string): Promise<ShoppingList[]> {
  const { data, error } = await db
    .from('shopping_lists')
    .select(LIST_COLUMNS)
    .eq('household_id', householdId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Every item of the household (tiny), in list then position order. */
export async function listItems(householdId: string): Promise<ShoppingListItem[]> {
  const { data, error } = await db
    .from('shopping_list_items')
    .select(ITEM_COLUMNS)
    .eq('household_id', householdId)
    .order('list_id', { ascending: true })
    .order('position', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export interface NewList {
  householdId: string;
  vendorId: string | null;
  name: string;
  loyaltyCardId: string | null;
  createdBy: string | null;
}

/**
 * Create a list. A second list for the same vendor rejects with `23505` (the
 * one-list-per-vendor index) — the caller opens the existing list instead.
 */
export async function createList(input: NewList): Promise<{ id: string }> {
  const { data, error } = await db
    .from('shopping_lists')
    .insert({
      household_id: input.householdId,
      vendor_id: input.vendorId,
      name: input.name,
      loyalty_card_id: input.loyaltyCardId,
      created_by: input.createdBy,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id };
}

export async function updateListCard(id: string, loyaltyCardId: string | null): Promise<void> {
  const { error } = await db
    .from('shopping_lists')
    .update({ loyalty_card_id: loyaltyCardId })
    .eq('id', id);
  if (error) throw error;
}

/** Delete a list; its items cascade. */
export async function deleteList(id: string): Promise<void> {
  const { error } = await db.from('shopping_lists').delete().eq('id', id);
  if (error) throw error;
}

export interface NewItem {
  /** Client-generated uuid so the optimistic row keeps its identity (see optimistic.ts). */
  id: string;
  householdId: string;
  listId: string;
  name: string;
  quantity: string | null;
  position: number;
  createdBy: string | null;
}

export async function addItem(input: NewItem): Promise<{ id: string }> {
  const { error } = await db.from('shopping_list_items').insert({
    id: input.id,
    household_id: input.householdId,
    list_id: input.listId,
    name: input.name,
    quantity: input.quantity,
    position: input.position,
    created_by: input.createdBy,
  });
  if (error) throw error;
  return { id: input.id };
}

/** `checked_at` = now() (client clock) / null, and who took it. */
export async function setItemChecked(
  id: string,
  checked: boolean,
  userId: string | null,
  checkedAt: string = new Date().toISOString(),
): Promise<void> {
  const { error } = await db
    .from('shopping_list_items')
    .update(
      checked
        ? { checked_at: checkedAt, checked_by: userId }
        : { checked_at: null, checked_by: null },
    )
    .eq('id', id);
  if (error) throw error;
}

export async function updateItem(
  id: string,
  patch: { name: string; quantity: string | null },
): Promise<void> {
  const { error } = await db
    .from('shopping_list_items')
    .update({ name: patch.name, quantity: patch.quantity })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteItem(id: string): Promise<void> {
  const { error } = await db.from('shopping_list_items').delete().eq('id', id);
  if (error) throw error;
}

/** Remove every taken item of one list. */
export async function clearChecked(listId: string): Promise<void> {
  const { error } = await db
    .from('shopping_list_items')
    .delete()
    .eq('list_id', listId)
    .not('checked_at', 'is', null);
  if (error) throw error;
}

// features/shopping/mutations.ts — optimistic writes (spec §8.4) + list creation.
//
// Every mutator updates the store first, then writes; a failed write reverts
// (the engine's onError). Each resolves `true` on
// success, `false` when reverted — callers never need try/catch. See
// ./optimistic.ts for how these reconcile with realtime refetches.
import { randomUUID } from 'expo-crypto';
import { useAuthStore } from '@/features/auth/store';
import * as api from './api';
import { openOrCreateList } from './create';
import { nextPosition } from './order';
import { useShoppingStore } from './store';
import { refreshShopping, shoppingEngine } from './sync';
import type { QuickAddDraft } from './types';

const householdId = () => useAuthStore.getState().householdId;

/** Check / uncheck. The DB write is immediate; the row's regrouping delay is the screen's job. */
export function toggleItem(id: string, checked: boolean, userId: string | null): Promise<boolean> {
  const checkedAt = checked ? new Date().toISOString() : null;
  return shoppingEngine.run(
    { kind: 'check', itemId: id, checkedAt, checkedBy: checked ? userId : null },
    () => api.setItemChecked(id, checked, userId, checkedAt ?? undefined),
  );
}

/**
 * Append an item at the end of the list. The row carries a client-generated
 * uuid (not a `tmp-` id): when the server row arrives it has the same id, so
 * React keeps the row mounted instead of replaying exit + enter.
 */
export function addItemOptimistic(
  listId: string,
  draft: QuickAddDraft,
  userId: string | null,
): Promise<boolean> {
  const house = householdId();
  if (!house) return Promise.resolve(false);
  const position = nextPosition(useShoppingStore.getState().items.filter((i) => i.list_id === listId));
  const id = randomUUID();
  const item = {
    id,
    household_id: house,
    list_id: listId,
    name: draft.name,
    quantity: draft.quantity,
    position,
    checked_at: null,
    checked_by: null,
    created_by: userId,
    created_at: new Date().toISOString(),
  };
  return shoppingEngine.run({ kind: 'addItem', item }, () =>
    api
      .addItem({
        id,
        householdId: house,
        listId,
        name: draft.name,
        quantity: draft.quantity,
        position,
        createdBy: userId,
      })
      .then(() => undefined),
  );
}

export function updateItemOptimistic(id: string, draft: QuickAddDraft): Promise<boolean> {
  return shoppingEngine.run(
    { kind: 'updateItem', itemId: id, name: draft.name, quantity: draft.quantity },
    () => api.updateItem(id, draft),
  );
}

export function removeItemOptimistic(id: string): Promise<boolean> {
  return shoppingEngine.run({ kind: 'removeItem', itemId: id }, () => api.deleteItem(id));
}

export function clearCheckedOptimistic(listId: string): Promise<boolean> {
  return shoppingEngine.run({ kind: 'clearChecked', listId }, () => api.clearChecked(listId));
}

export function setListCardOptimistic(listId: string, cardId: string | null): Promise<boolean> {
  return shoppingEngine.run({ kind: 'setCard', listId, cardId }, () =>
    api.updateListCard(listId, cardId),
  );
}

export function deleteListOptimistic(listId: string): Promise<boolean> {
  return shoppingEngine.run({ kind: 'removeList', listId }, () => api.deleteList(listId));
}

/**
 * The vendor's existing list, or a new one with `loyaltyCardId` attached
 * (not optimistic: the caller navigates to the id). Rejects on failure.
 */
export function openOrCreateVendorList(input: {
  vendorId: string;
  name: string;
  loyaltyCardId: string | null;
}): Promise<{ id: string; created: boolean }> {
  const house = householdId();
  if (!house) return Promise.reject(new Error('no household'));
  return openOrCreateList(
    {
      householdId: house,
      vendorId: input.vendorId,
      name: input.name,
      loyaltyCardId: input.loyaltyCardId,
      createdBy: useAuthStore.getState().session?.user.id ?? null,
    },
    {
      getLists: () => useShoppingStore.getState().lists,
      createList: api.createList,
      refresh: refreshShopping,
    },
  );
}

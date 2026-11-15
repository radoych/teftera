// features/shopping/create.ts — "new list for a vendor" decisions (spec §8.8). Pure + injected I/O.
import type { NewList } from './api';
import type { ShoppingList } from './types';

export type CardChoice = { kind: 'resolved'; cardId: string | null } | { kind: 'pick' };

/** 0 cards → none · 1 → that card · 2+ → ask the user (CardPickerSheet). */
export function cardChoice(cards: readonly { id: string }[]): CardChoice {
  if (cards.length === 0) return { kind: 'resolved', cardId: null };
  if (cards.length === 1) return { kind: 'resolved', cardId: cards[0]?.id ?? null };
  return { kind: 'pick' };
}

export interface OpenOrCreateDeps {
  /** The lists currently in the store (fresh after `refresh`). */
  getLists: () => readonly ShoppingList[];
  createList: (input: NewList) => Promise<{ id: string }>;
  refresh: (householdId: string) => Promise<void>;
}

const isUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && 'code' in err && err.code === '23505';

const listForVendor = (lists: readonly ShoppingList[], vendorId: string | null) =>
  vendorId === null ? undefined : lists.find((l) => l.vendor_id === vendorId);

/**
 * One active list per vendor (decision #8): return the vendor's existing list,
 * or create one and refresh the store so the list screen finds it. A `23505`
 * means the other phone created it a moment ago — refresh and open that one.
 */
export async function openOrCreateList(
  input: NewList,
  deps: OpenOrCreateDeps,
): Promise<{ id: string; created: boolean }> {
  const existing = listForVendor(deps.getLists(), input.vendorId);
  if (existing) return { id: existing.id, created: false };

  try {
    const { id } = await deps.createList(input);
    await deps.refresh(input.householdId).catch(() => {});
    return { id, created: true };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    await deps.refresh(input.householdId).catch(() => {});
    const raced = listForVendor(deps.getLists(), input.vendorId);
    if (raced) return { id: raced.id, created: false };
    throw err;
  }
}

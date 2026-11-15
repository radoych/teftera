// features/shopping/fixtures.ts — row builders for the shopping tests.
import type { ShoppingList, ShoppingListItem } from './types';

export function makeList(overrides: Partial<ShoppingList> & { id: string }): ShoppingList {
  return {
    household_id: 'h1',
    vendor_id: null,
    name: 'Kaufland',
    loyalty_card_id: null,
    created_by: null,
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:00:00.000Z',
    ...overrides,
  };
}

export function makeItem(overrides: Partial<ShoppingListItem> & { id: string }): ShoppingListItem {
  return {
    household_id: 'h1',
    list_id: 'l1',
    name: 'мляко',
    quantity: null,
    position: 0,
    checked_at: null,
    checked_by: null,
    created_by: null,
    created_at: '2026-11-01T10:00:00.000Z',
    ...overrides,
  };
}

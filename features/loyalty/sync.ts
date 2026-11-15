// features/loyalty/sync.ts — load + live-sync of the household's loyalty cards.
import { useMemo } from 'react';
import { createHouseholdSync } from '@/features/sync/householdSync';
import { useHouseholdSync } from '@/features/sync/useHouseholdSync';
import { listCards } from './api';
import { cardsForVendor, countCardsByVendor } from './group';
import { useLoyaltyStore } from './store';
import type { LoyaltyCard } from './types';

/** Cards kept live from the `loyalty_cards` realtime channel (refetch on change). */
export const loyaltySync = createHouseholdSync({
  label: 'loyalty',
  tables: ['loyalty_cards'],
  load: listCards,
  apply: (cards) => useLoyaltyStore.getState().setCards(cards),
  reset: () => useLoyaltyStore.getState().reset(),
});

/** Reload the cards; resolves once the store holds data fetched after this call. */
export const refreshLoyaltyCards = (householdId: string): Promise<void> =>
  loyaltySync.refresh(householdId);

/** Keep the household's loyalty cards live. Call once, in the (app) layout. */
export function useLoyaltySync(): void {
  useHouseholdSync(loyaltySync);
}

/** One vendor's cards (null = orphans), nickname-sorted. Memoised per store update. */
export function useCardsForVendor(vendorId: string | null): LoyaltyCard[] {
  const cards = useLoyaltyStore((s) => s.cards);
  return useMemo(() => cardsForVendor(cards, vendorId), [cards, vendorId]);
}

/** Vendor id → number of its cards (for meta lines / autocomplete). Stable per store update. */
export function useCardCount(): (vendorId: string) => number {
  const cards = useLoyaltyStore((s) => s.cards);
  return useMemo(() => {
    const counts = countCardsByVendor(cards);
    return (vendorId: string) => counts.get(vendorId) ?? 0;
  }, [cards]);
}

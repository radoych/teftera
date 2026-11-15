// features/loyalty/group.ts — pure grouping / selection of cards for the screens.
import type { LoyaltyCard, VendorNameLookup } from './types';

export const NO_VENDOR_TITLE = 'Без търговец';
/** Group key for orphan cards (no vendor, or a vendor whose name is not known). */
export const NO_VENDOR_KEY = '__no_vendor__';

export interface CardGroup {
  key: string;
  title: string;
  /** null for the "Без търговец" group. */
  vendorId: string | null;
  cards: LoyaltyCard[];
}

/** Default lookup until the vendors store is plugged in: nothing resolves. */
export const noVendorNames: VendorNameLookup = () => undefined;

const compare = (a: string, b: string) => a.localeCompare(b, 'bg', { sensitivity: 'base' });
const byNickname = (a: LoyaltyCard, b: LoyaltyCard) => compare(a.nickname, b.nickname);

/**
 * Cards grouped under their vendor's name (alphabetical), each group sorted by
 * nickname; cards without a vendor — or whose vendor name the lookup cannot
 * resolve — go last under "Без търговец".
 */
export function groupCardsByVendor(
  cards: readonly LoyaltyCard[],
  vendorName: VendorNameLookup = noVendorNames,
): CardGroup[] {
  const named = new Map<string, CardGroup>();
  const orphans: LoyaltyCard[] = [];

  for (const card of cards) {
    const title = card.vendor_id ? vendorName(card.vendor_id) : undefined;
    if (!card.vendor_id || title === undefined) {
      orphans.push(card);
      continue;
    }
    const group = named.get(card.vendor_id);
    if (group) group.cards.push(card);
    else named.set(card.vendor_id, { key: card.vendor_id, title, vendorId: card.vendor_id, cards: [card] });
  }

  const groups = [...named.values()].sort((a, b) => compare(a.title, b.title));
  for (const g of groups) g.cards.sort(byNickname);
  if (orphans.length > 0) {
    groups.push({
      key: NO_VENDOR_KEY,
      title: NO_VENDOR_TITLE,
      vendorId: null,
      cards: orphans.sort(byNickname),
    });
  }
  return groups;
}

/** One vendor's cards (null = orphan cards), sorted by nickname. */
export function cardsForVendor(
  cards: readonly LoyaltyCard[],
  vendorId: string | null,
): LoyaltyCard[] {
  return cards.filter((c) => c.vendor_id === vendorId).sort(byNickname);
}

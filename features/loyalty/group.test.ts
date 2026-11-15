import { cardsForVendor, groupCardsByVendor, NO_VENDOR_KEY, NO_VENDOR_TITLE } from './group';
import type { LoyaltyCard } from './types';

const card = (id: string, vendorId: string | null, nickname: string): LoyaltyCard => ({
  id,
  household_id: 'h1',
  vendor_id: vendorId,
  nickname,
  code: '5901234123457',
  code_format: 'ean13',
  color: '#adc7ff',
  note: null,
  created_by: null,
  created_at: '2026-11-15T10:00:00Z',
  updated_at: '2026-11-15T10:00:00Z',
});

const names: Record<string, string> = { v1: 'Лидл', v2: 'Kaufland', v3: 'Билла' };
const lookup = (id: string): string | undefined => names[id];

describe('groupCardsByVendor', () => {
  it('groups by vendor alphabetically with orphans last', () => {
    const groups = groupCardsByVendor(
      [
        card('a', 'v1', 'Мария'),
        card('b', null, 'Стара'),
        card('c', 'v2', 'Иван'),
        card('d', 'v1', 'Ани'),
        card('e', 'v3', 'Иван'),
      ],
      lookup,
    );
    expect(groups.map((g) => g.title)).toEqual(['Билла', 'Лидл', 'Kaufland', NO_VENDOR_TITLE]);
    expect(groups[1]?.cards.map((c) => c.id)).toEqual(['d', 'a']);
    expect(groups[1]?.vendorId).toBe('v1');
    expect(groups[3]).toMatchObject({ key: NO_VENDOR_KEY, vendorId: null });
  });

  it('puts cards whose vendor name is unknown under "Без търговец"', () => {
    const groups = groupCardsByVendor([card('a', 'v9', 'X'), card('b', null, 'A')], lookup);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.title).toBe(NO_VENDOR_TITLE);
    expect(groups[0]?.cards.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('uses the default lookup (nothing resolves) when none is given', () => {
    const groups = groupCardsByVendor([card('a', 'v1', 'X')]);
    expect(groups.map((g) => g.key)).toEqual([NO_VENDOR_KEY]);
  });

  it('returns no groups for no cards', () => {
    expect(groupCardsByVendor([], lookup)).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const cards = [card('a', null, 'Б'), card('b', null, 'А')];
    groupCardsByVendor(cards, lookup);
    expect(cards.map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('cardsForVendor', () => {
  it('returns that vendor’s cards sorted by nickname', () => {
    const cards = [card('a', 'v1', 'Мария'), card('b', 'v2', 'Ани'), card('c', 'v1', 'Ани')];
    expect(cardsForVendor(cards, 'v1').map((c) => c.id)).toEqual(['c', 'a']);
  });

  it('returns orphan cards for null', () => {
    const cards = [card('a', null, 'Б'), card('b', 'v2', 'А'), card('c', null, 'А')];
    expect(cardsForVendor(cards, null).map((c) => c.id)).toEqual(['c', 'a']);
  });
});

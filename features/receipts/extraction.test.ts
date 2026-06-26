import type { ReceiptExtraction } from '@/services/gemini';
import { itemsToNote, itemsSumCents, extractionToForm } from './extraction';

describe('itemsToNote', () => {
  it('joins non-empty descriptions with a comma', () => {
    expect(
      itemsToNote([
        { description: 'Кафе еспресо' },
        { description: 'лимонада бъз' },
        { description: 'донът' },
      ]),
    ).toBe('Кафе еспресо, лимонада бъз, донът');
  });
  it('trims and drops empty descriptions', () => {
    expect(itemsToNote([{ description: ' Кафе ' }, { description: '  ' }, { description: '' }])).toBe(
      'Кафе',
    );
  });
  it('returns an empty string when there are no items', () => {
    expect(itemsToNote([])).toBe('');
  });
});

describe('itemsSumCents', () => {
  it('sums parsed comma-decimal amounts', () => {
    expect(itemsSumCents([{ amount: '5,40' }, { amount: '3,80' }])).toBe(920);
  });
  it('treats unparseable amounts as zero', () => {
    expect(itemsSumCents([{ amount: '' }, { amount: 'abc' }, { amount: '2,00' }])).toBe(200);
  });
});

describe('extractionToForm', () => {
  const base: ReceiptExtraction = {
    merchant: 'Kaufland',
    date: '2026-06-20',
    totalCents: 1420,
    currency: 'EUR',
    items: [
      { description: 'Кафе', amountCents: 540 },
      { description: 'Мъфин', amountCents: 380 },
    ],
  };

  it('maps merchant, total string, date, and items with stable ids', () => {
    const seed = extractionToForm(base);
    expect(seed.merchant).toBe('Kaufland');
    expect(seed.total).toBe('14,20');
    expect(seed.date).toBe('2026-06-20');
    expect(seed.items).toEqual([
      { id: '0', description: 'Кафе', amount: '5,40' },
      { id: '1', description: 'Мъфин', amount: '3,80' },
    ]);
  });

  it('uses an empty total when none was detected', () => {
    expect(extractionToForm({ ...base, totalCents: 0 }).total).toBe('');
  });

  it("falls back to today's date when extraction has none", () => {
    expect(extractionToForm({ ...base, date: null }).date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

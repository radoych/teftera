import { dedupeImport, importKey } from './dedup';
import type { Transaction } from './types';

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: 'x',
    household_id: 'h',
    user_id: null,
    amount_eur: 0,
    original_amount: null,
    original_currency: null,
    merchant: '',
    category_id: null,
    date: '2026-02-01',
    note: null,
    source: 'manual',
    receipt_id: null,
    is_flagged: false,
    created_at: '',
    ...partial,
  };
}

const candidate = (date: string, amountEurCents: number, merchant: string) => ({
  date,
  amountEurCents,
  merchant,
});

describe('importKey', () => {
  it('is case- and whitespace-insensitive on merchant', () => {
    expect(importKey('2026-02-04', 3766, '  Lidl ')).toBe(importKey('2026-02-04', 3766, 'lidl'));
  });

  it('differs when date, amount, or merchant differ', () => {
    expect(importKey('2026-02-04', 3766, 'Lidl')).not.toBe(importKey('2026-02-05', 3766, 'Lidl'));
    expect(importKey('2026-02-04', 3766, 'Lidl')).not.toBe(importKey('2026-02-04', 100, 'Lidl'));
    expect(importKey('2026-02-04', 3766, 'Lidl')).not.toBe(importKey('2026-02-04', 3766, 'dm'));
  });
});

describe('dedupeImport', () => {
  it('flags candidates already present in the DB as duplicates', () => {
    const existing = [tx({ date: '2026-02-04', amount_eur: 3766, merchant: 'Lidl' })];
    const candidates = [
      candidate('2026-02-04', 3766, 'Lidl'), // dup
      candidate('2026-02-05', 664, 'dm'), // new
    ];
    const { toImport, duplicates } = dedupeImport(candidates, existing);
    expect(toImport).toEqual([candidate('2026-02-05', 664, 'dm')]);
    expect(duplicates).toEqual([candidate('2026-02-04', 3766, 'Lidl')]);
  });

  it('keeps two identical rows within one batch (dedup is against DB only)', () => {
    const candidates = [candidate('2026-02-04', 100, 'dm'), candidate('2026-02-04', 100, 'dm')];
    const { toImport, duplicates } = dedupeImport(candidates, []);
    expect(toImport).toHaveLength(2);
    expect(duplicates).toHaveLength(0);
  });
});

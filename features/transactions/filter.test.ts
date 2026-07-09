import type { Transaction } from './types';
import { activeFilterCount, filterTransactions } from './filter';

function tx(p: Partial<Transaction> & { id: string }): Transaction {
  return {
    household_id: 'h', user_id: 'u1', amount_eur: 1000,
    original_amount: null, original_currency: null, merchant: 'Kaufland',
    category_id: 'c1', date: '2026-07-01', note: null, source: 'manual',
    receipt_id: null, is_flagged: false, occurred_at: null,
    created_at: '2026-07-01T00:00:00.000Z', ...p,
  };
}

const base = { query: '', categoryIds: [] as string[], person: 'all' as const, myUserId: 'u1' };

describe('filterTransactions', () => {
  const txs = [
    tx({ id: 'a', merchant: 'Kaufland', category_id: 'c1', user_id: 'u1' }),
    tx({ id: 'b', merchant: 'Lidl', category_id: 'c2', user_id: 'u2', note: 'за партито' }),
    tx({ id: 'c', merchant: 'OMV', category_id: null, user_id: 'u1' }),
  ];

  it('passes everything through with no active controls', () => {
    expect(filterTransactions(txs, base)).toHaveLength(3);
  });

  it('matches query against merchant case-insensitively', () => {
    expect(filterTransactions(txs, { ...base, query: 'kauf' }).map((t) => t.id)).toEqual(['a']);
  });

  it('matches query against the note too', () => {
    expect(filterTransactions(txs, { ...base, query: 'парти' }).map((t) => t.id)).toEqual(['b']);
  });

  it('filters by category ids', () => {
    expect(
      filterTransactions(txs, { ...base, categoryIds: ['c1', 'c2'] }).map((t) => t.id),
    ).toEqual(['a', 'b']);
  });

  it('person=me keeps only my transactions', () => {
    expect(filterTransactions(txs, { ...base, person: 'me' }).map((t) => t.id)).toEqual(['a', 'c']);
  });

  it('combines query + category + person', () => {
    expect(
      filterTransactions(txs, { ...base, query: 'omv', categoryIds: [], person: 'me' }).map(
        (t) => t.id,
      ),
    ).toEqual(['c']);
  });
});

describe('activeFilterCount', () => {
  it('counts categories and person scope, not search', () => {
    expect(activeFilterCount({ categoryIds: [], person: 'all' })).toBe(0);
    expect(activeFilterCount({ categoryIds: ['c1'], person: 'all' })).toBe(1);
    expect(activeFilterCount({ categoryIds: ['c1', 'c2'], person: 'me' })).toBe(2);
  });
});

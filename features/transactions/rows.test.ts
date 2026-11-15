import { parseTxKind, parseTxSource, toCategoryLite, toTransaction } from './rows';

const row = {
  id: 't1',
  household_id: 'h1',
  user_id: 'u1',
  amount_eur: 1250,
  original_amount: null,
  original_currency: null,
  merchant: 'Lidl',
  category_id: 'c1',
  date: '2026-09-01',
  note: null,
  source: 'receipt',
  receipt_id: 'r1',
  is_flagged: false,
  occurred_at: null,
  created_at: '2026-09-01T10:00:00Z',
  kind: 'expense',
};

describe('row narrowing', () => {
  it('parseTxKind keeps income and defaults everything else to expense', () => {
    expect(parseTxKind('income')).toBe('income');
    expect(parseTxKind('expense')).toBe('expense');
    expect(parseTxKind('weird')).toBe('expense');
  });

  it('parseTxSource passes known sources and defaults to manual', () => {
    expect(parseTxSource('dsk_import')).toBe('dsk_import');
    expect(parseTxSource('receipt')).toBe('receipt');
    expect(parseTxSource('manual')).toBe('manual');
    expect(parseTxSource('other')).toBe('manual');
  });

  it('toTransaction keeps every column and narrows kind/source', () => {
    expect(toTransaction({ ...row, kind: 'income', source: 'dsk_import' })).toEqual({
      ...row,
      kind: 'income',
      source: 'dsk_import',
    });
  });

  it('toCategoryLite narrows kind', () => {
    expect(
      toCategoryLite({ id: 'c1', name: 'Храна', icon: 'restaurant', color: '#fff', is_default: true, kind: 'income' }),
    ).toEqual({ id: 'c1', name: 'Храна', icon: 'restaurant', color: '#fff', is_default: true, kind: 'income' });
  });
});

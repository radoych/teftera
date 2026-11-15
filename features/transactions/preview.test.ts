import type { NormalizedTransaction } from '@/services/dsk-import';
import { buildPreview, previewCandidates } from './preview';
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
    kind: 'expense',
    receipt_id: null,
    is_flagged: false,
    occurred_at: null,
    created_at: '',
    ...partial,
  };
}

function row(partial: Partial<NormalizedTransaction>): NormalizedTransaction {
  return {
    kind: 'expense',
    amountEurCents: 1000,
    originalAmountCents: null,
    originalCurrency: null,
    merchant: 'Lidl',
    categoryGuess: 'Groceries',
    date: '2026-02-10',
    occurredAt: '2026-02-10T10:00:00.000Z',
    ...partial,
  };
}

const WINDOW_START = '2026-01-01';

describe('buildPreview', () => {
  it('splits new rows by kind and keeps duplicates aside', () => {
    const expense = row({ merchant: 'Kaufland', amountEurCents: 2500 });
    const income = row({ kind: 'income', merchant: 'Заплата', amountEurCents: 300000 });
    const dup = row({ merchant: 'Lidl', amountEurCents: 1234, date: '2026-02-03' });
    const existing = [tx({ merchant: 'lidl ', amount_eur: 1234, date: '2026-02-03' })];

    const p = buildPreview([expense, income, dup], existing, 'export.csv', 'csv', false, WINDOW_START);

    expect(p.newExpenses).toEqual([expense]);
    expect(p.newIncome).toEqual([income]);
    expect(p.duplicates).toEqual([dup]);
    expect(p).toMatchObject({ fileName: 'export.csv', source: 'csv', truncated: false });
    expect(p.outOfWindow).toBe(false);
  });

  it('flags rows older than the dedup window', () => {
    const old = row({ date: '2025-12-31' });
    const p = buildPreview([old, row({})], [], 'Синхронизация с ДСК', 'bank', true, WINDOW_START);
    expect(p.outOfWindow).toBe(true);
    expect(p.truncated).toBe(true);
    expect(p.source).toBe('bank');
  });

  it('treats a row exactly on the window start as in-window', () => {
    const p = buildPreview([row({ date: WINDOW_START })], [], 'f', 'csv', false, WINDOW_START);
    expect(p.outOfWindow).toBe(false);
  });

  it('defaults the window start to the fetched-transaction window', () => {
    const p = buildPreview([row({ date: '1999-01-01' })], [], 'f', 'csv', false);
    expect(p.outOfWindow).toBe(true);
  });
});

describe('previewCandidates', () => {
  it('lists expenses before income', () => {
    const e = row({ merchant: 'A' });
    const i = row({ kind: 'income', merchant: 'B' });
    const p = buildPreview([i, e], [], 'f', 'csv', false, WINDOW_START);
    expect(previewCandidates(p)).toEqual([e, i]);
  });
});

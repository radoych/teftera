import { lastDskSyncAt, formatLastSync } from './lastSync';
import type { Transaction } from './types';

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: 'x',
    household_id: 'h',
    user_id: null,
    amount_eur: 1000,
    original_amount: null,
    original_currency: null,
    merchant: 'Test',
    category_id: null,
    date: '2026-06-25',
    note: null,
    source: 'manual',
    kind: 'expense',
    receipt_id: null,
    is_flagged: false,
    occurred_at: null,
    created_at: '2026-06-25T10:00:00Z',
    ...partial,
  };
}

describe('lastDskSyncAt', () => {
  it('returns the newest created_at among dsk_import transactions', () => {
    const txs = [
      tx({ id: '1', source: 'dsk_import', created_at: '2026-06-23T08:00:00Z' }),
      tx({ id: '2', source: 'dsk_import', created_at: '2026-06-25T14:30:00Z' }),
      tx({ id: '3', source: 'dsk_import', created_at: '2026-06-20T09:00:00Z' }),
    ];
    expect(lastDskSyncAt(txs)).toBe('2026-06-25T14:30:00Z');
  });

  it('ignores manual and receipt transactions', () => {
    const txs = [
      tx({ id: '1', source: 'manual', created_at: '2026-06-25T20:00:00Z' }),
      tx({ id: '2', source: 'receipt', created_at: '2026-06-25T21:00:00Z' }),
      tx({ id: '3', source: 'dsk_import', created_at: '2026-06-24T10:00:00Z' }),
    ];
    expect(lastDskSyncAt(txs)).toBe('2026-06-24T10:00:00Z');
  });

  it('returns null when there are no dsk_import transactions', () => {
    const txs = [
      tx({ id: '1', source: 'manual', created_at: '2026-06-25T10:00:00Z' }),
      tx({ id: '2', source: 'receipt', created_at: '2026-06-25T11:00:00Z' }),
    ];
    expect(lastDskSyncAt(txs)).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(lastDskSyncAt([])).toBeNull();
  });

  it('returns the single entry when there is exactly one dsk_import', () => {
    const txs = [tx({ id: '1', source: 'dsk_import', created_at: '2026-02-23T07:54:54Z' })];
    expect(lastDskSyncAt(txs)).toBe('2026-02-23T07:54:54Z');
  });
});

describe('formatLastSync', () => {
  it('returns "Никога" when given null', () => {
    expect(formatLastSync(null)).toBe('Никога');
  });

  it('returns a label starting with "Днес" for a same-day timestamp', () => {
    // now = 25 Jun 2026 at noon local time
    const now = new Date(2026, 5, 25, 12, 0, 0);
    const iso = '2026-06-25T14:30:00Z';
    const result = formatLastSync(iso, now);
    expect(result).toContain('Днес');
  });

  it('includes the time portion for a same-day timestamp', () => {
    const now = new Date(2026, 5, 25, 12, 0, 0);
    const iso = '2026-06-25T14:30:00Z';
    const result = formatLastSync(iso, now);
    // The time portion should be present (HH:MM format, exact digits depend on TZ but colon separates)
    expect(result).toMatch(/\d{2}:\d{2}/);
  });

  it('returns a label starting with "Вчера" for a yesterday timestamp', () => {
    // now = 25 Jun 2026 local
    const now = new Date(2026, 5, 25, 12, 0, 0);
    // parsed as local midnight, so use a timestamp that lands on Jun 24 local
    const iso = '2026-06-24T10:00:00';
    const result = formatLastSync(iso, now);
    expect(result).toContain('Вчера');
  });

  it('returns a localized date label for older timestamps', () => {
    const now = new Date(2026, 5, 25, 12, 0, 0);
    const iso = '2026-02-23T07:54:54';
    const result = formatLastSync(iso, now);
    // Should NOT contain Днес or Вчера
    expect(result).not.toContain('Днес');
    expect(result).not.toContain('Вчера');
    // Should contain the time
    expect(result).toMatch(/\d{2}:\d{2}/);
  });

  it('handles a real UTC Z-suffixed timestamp (production code path)', () => {
    // Production created_at values always end in Z (e.g. '2026-06-25T07:30:00Z')
    // Use a now that is clearly in the future on the same day so the label is day-based
    const now = new Date(2026, 5, 25, 23, 59, 0); // 25 Jun 2026 local
    const iso = '2026-06-25T07:30:00Z';
    const result = formatLastSync(iso, now);
    // The label must contain a day keyword and a time portion
    expect(result).toMatch(/\d{2}:\d{2}/);
    // Should not be Никога
    expect(result).not.toBe('Никога');
  });
});

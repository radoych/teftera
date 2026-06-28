import type { Transaction } from '@/features/transactions/types';
import { comparisonRange, filterByDateBounds, filterByRange, rangeBounds } from './range';

const NOW = new Date(2026, 5, 15); // 15 Jun 2026

function tx(date: string): Transaction {
  return {
    id: date, household_id: 'h', user_id: 'u', amount_eur: 100,
    original_amount: null, original_currency: null, merchant: 'M',
    category_id: null, date, note: null, source: 'manual',
    receipt_id: null, is_flagged: false, occurred_at: null,
    created_at: `${date}T00:00:00.000Z`,
  };
}

describe('rangeBounds', () => {
  it('this_month → the full current calendar month', () => {
    expect(rangeBounds('this_month', NOW)).toEqual({ startISO: '2026-06-01', endISO: '2026-06-30' });
  });
  it('last_month → the previous calendar month', () => {
    expect(rangeBounds('last_month', NOW)).toEqual({ startISO: '2026-05-01', endISO: '2026-05-31' });
  });
  it('last_3_months → current plus the two preceding months', () => {
    expect(rangeBounds('last_3_months', NOW)).toEqual({ startISO: '2026-04-01', endISO: '2026-06-30' });
  });
  it('year → the trailing 12 calendar months', () => {
    expect(rangeBounds('year', NOW)).toEqual({ startISO: '2025-07-01', endISO: '2026-06-30' });
  });
});

describe('comparisonRange', () => {
  it('this_month → the month before', () => {
    expect(comparisonRange('this_month', NOW)).toEqual({ startISO: '2026-05-01', endISO: '2026-05-31' });
  });
  it('last_3_months → the three months before the window', () => {
    expect(comparisonRange('last_3_months', NOW)).toEqual({ startISO: '2026-01-01', endISO: '2026-03-31' });
  });
  it('year → the twelve months before the window', () => {
    expect(comparisonRange('year', NOW)).toEqual({ startISO: '2024-07-01', endISO: '2025-06-30' });
  });
});

describe('filterByRange / filterByDateBounds', () => {
  it('filterByRange keeps only dates inside the inclusive window', () => {
    const txs = [tx('2026-06-01'), tx('2026-06-30'), tx('2026-05-31'), tx('2026-07-01')];
    expect(filterByRange(txs, 'this_month', NOW).map((t) => t.date)).toEqual(['2026-06-01', '2026-06-30']);
  });
  it('filterByDateBounds is inclusive on both ends', () => {
    const txs = [tx('2026-03-31'), tx('2026-04-01'), tx('2026-06-30'), tx('2026-07-01')];
    expect(filterByDateBounds(txs, '2026-04-01', '2026-06-30').map((t) => t.date)).toEqual([
      '2026-04-01',
      '2026-06-30',
    ]);
  });
});

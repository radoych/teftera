import type { Transaction } from '@/features/transactions/types';
import { monthlyTrend, sumCents, topMerchants } from './aggregate';

const NOW = new Date(2026, 5, 15); // Jun 2026

function tx(p: Partial<Transaction> & { date: string }): Transaction {
  return {
    id: `${p.date}-${p.merchant ?? ''}`, household_id: 'h', user_id: 'u', amount_eur: 100,
    original_amount: null, original_currency: null, merchant: 'M',
    category_id: null, note: null, source: 'manual', kind: 'expense', receipt_id: null,
    is_flagged: false, occurred_at: null, created_at: `${p.date}T00:00:00.000Z`,
    ...p,
  };
}

describe('sumCents', () => {
  it('adds amount_eur', () => {
    expect(sumCents([tx({ date: '2026-06-01', amount_eur: 500 }), tx({ date: '2026-06-02', amount_eur: 250 })])).toBe(750);
  });
  it('is zero for an empty list', () => {
    expect(sumCents([])).toBe(0);
  });
});

describe('monthlyTrend', () => {
  it('produces monthsBack buckets oldest→newest with BG labels and a current flag', () => {
    const rows = monthlyTrend([], 6, NOW);
    expect(rows.map((r) => r.label)).toEqual(['ЯНУ', 'ФЕВ', 'МАР', 'АПР', 'МАЙ', 'ЮНИ']);
    expect(rows[5]!.isCurrent).toBe(true);
    expect(rows.slice(0, 5).every((r) => !r.isCurrent)).toBe(true);
  });
  it('buckets spend by month and scales fraction to the tallest bar', () => {
    const rows = monthlyTrend(
      [
        tx({ date: '2026-04-10', amount_eur: 1000 }), // АПР
        tx({ date: '2026-06-01', amount_eur: 4000 }), // ЮНИ
        tx({ date: '2026-06-20', amount_eur: 0 }),
      ],
      6,
      NOW,
    );
    const jun = rows.find((r) => r.label === 'ЮНИ')!;
    const apr = rows.find((r) => r.label === 'АПР')!;
    expect([jun.totalCents, apr.totalCents]).toEqual([4000, 1000]);
    expect(jun.fraction).toBe(1);
    expect(apr.fraction).toBe(0.25);
  });
  it('all-zero spend yields fraction 0 (no NaN)', () => {
    expect(monthlyTrend([], 6, NOW).every((r) => r.fraction === 0)).toBe(true);
  });
  it('excludes months outside the window', () => {
    const rows = monthlyTrend([tx({ date: '2025-12-31', amount_eur: 5000 })], 6, NOW); // Dec 2025, just before Jan
    expect(rows.every((r) => r.totalCents === 0)).toBe(true);
  });
});

describe('topMerchants', () => {
  const txs = [
    tx({ date: '2026-06-01', merchant: 'Kaufland', amount_eur: 1000 }),
    tx({ date: '2026-06-02', merchant: 'Kaufland', amount_eur: 500 }),
    tx({ date: '2026-06-03', merchant: 'Lidl', amount_eur: 2000 }),
    tx({ date: '2026-06-04', merchant: 'Billa', amount_eur: 1500 }),
  ];
  it('groups, sums, sorts by total desc with ties broken by name asc', () => {
    expect(topMerchants(txs).map((m) => [m.merchant, m.totalCents])).toEqual([
      ['Lidl', 2000],
      ['Billa', 1500],
      ['Kaufland', 1500],
    ]);
  });
  it('limits to n', () => {
    expect(topMerchants(txs, 2)).toHaveLength(2);
  });
});

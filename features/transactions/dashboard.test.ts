import {
  dayTotalCents,
  filterByUser,
  pctChange,
  prevMonthTotalCents,
  spendingByCategory,
} from './dashboard';
import type { CategoryLite } from './groupByDay';
import type { Transaction } from './types';

const cats: CategoryLite[] = [
  { id: 'c1', name: 'Groceries', icon: 'shopping-basket', color: '#adc7ff' },
  { id: 'c2', name: 'Beverages', icon: 'local-cafe', color: '#d8e3ff' },
];

function tx(p: Partial<Transaction>): Transaction {
  return {
    id: 'id',
    household_id: 'h',
    user_id: 'u1',
    amount_eur: 1000,
    original_amount: null,
    original_currency: null,
    merchant: 'Test',
    category_id: 'c1',
    date: '2026-06-22',
    note: null,
    source: 'manual',
    receipt_id: null,
    is_flagged: false,
    occurred_at: null,
    created_at: '2026-06-22T08:30:00.000Z',
    ...p,
  };
}

const NOW = new Date(2026, 5, 22); // 22 Jun 2026, local

describe('dayTotalCents', () => {
  it('sums only transactions dated today', () => {
    const total = dayTotalCents(
      [
        tx({ id: '1', date: '2026-06-22', amount_eur: 500 }),
        tx({ id: '2', date: '2026-06-22', amount_eur: 1500 }),
        tx({ id: '3', date: '2026-06-21', amount_eur: 9999 }), // yesterday, excluded
      ],
      NOW,
    );
    expect(total).toBe(2000);
  });

  it('is zero when nothing is dated today', () => {
    expect(dayTotalCents([tx({ date: '2026-06-21' })], NOW)).toBe(0);
  });
});

describe('prevMonthTotalCents', () => {
  it('sums only the previous calendar month', () => {
    const total = prevMonthTotalCents(
      [
        tx({ id: '1', date: '2026-05-01', amount_eur: 500 }),
        tx({ id: '2', date: '2026-05-31', amount_eur: 1500 }),
        tx({ id: '3', date: '2026-06-01', amount_eur: 9999 }), // current month, excluded
        tx({ id: '4', date: '2026-04-30', amount_eur: 8888 }), // two months ago, excluded
      ],
      NOW,
    );
    expect(total).toBe(2000);
  });

  it('rolls back across the year boundary', () => {
    const jan = new Date(2026, 0, 15); // 15 Jan 2026
    const total = prevMonthTotalCents(
      [
        tx({ id: '1', date: '2025-12-25', amount_eur: 700 }),
        tx({ id: '2', date: '2026-01-02', amount_eur: 9999 }), // current month, excluded
      ],
      jan,
    );
    expect(total).toBe(700);
  });
});

describe('pctChange', () => {
  it('returns the signed rounded percentage change', () => {
    expect(pctChange(2000, 1000)).toBe(100);
    expect(pctChange(500, 1000)).toBe(-50);
    expect(pctChange(1100, 1000)).toBe(10);
  });

  it('returns null when the previous value is zero (no baseline)', () => {
    expect(pctChange(2000, 0)).toBeNull();
  });

  it('returns zero when unchanged', () => {
    expect(pctChange(1000, 1000)).toBe(0);
  });
});

describe('filterByUser', () => {
  const txs = [
    tx({ id: 'a', user_id: 'u1' }),
    tx({ id: 'b', user_id: 'u2' }),
    tx({ id: 'c', user_id: 'u1' }),
  ];

  it('returns every transaction for a null user (household view)', () => {
    expect(filterByUser(txs, null).map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps only the given user when filtering per-person', () => {
    expect(filterByUser(txs, 'u1').map((t) => t.id)).toEqual(['a', 'c']);
  });
});

describe('spendingByCategory', () => {
  it('totals current-month spend per category, sorted high to low', () => {
    const rows = spendingByCategory(
      [
        tx({ id: '1', category_id: 'c1', date: '2026-06-02', amount_eur: 1000 }),
        tx({ id: '2', category_id: 'c1', date: '2026-06-10', amount_eur: 1000 }),
        tx({ id: '3', category_id: 'c2', date: '2026-06-05', amount_eur: 500 }),
        tx({ id: '4', category_id: 'c1', date: '2026-05-31', amount_eur: 9999 }), // last month, excluded
      ],
      cats,
      NOW,
    );
    expect(rows.map((r) => [r.id, r.totalCents])).toEqual([
      ['c1', 2000],
      ['c2', 500],
    ]);
    expect(rows[0]!.name).toBe('Groceries');
    expect(rows[0]!.icon).toBe('shopping-basket');
  });

  it('expresses fraction relative to the largest bucket', () => {
    const rows = spendingByCategory(
      [
        tx({ id: '1', category_id: 'c1', date: '2026-06-02', amount_eur: 2000 }),
        tx({ id: '2', category_id: 'c2', date: '2026-06-05', amount_eur: 500 }),
      ],
      cats,
      NOW,
    );
    expect(rows[0]!.fraction).toBe(1);
    expect(rows[1]!.fraction).toBe(0.25);
  });

  it('buckets null and unknown categories into an Other row', () => {
    const rows = spendingByCategory(
      [
        tx({ id: '1', category_id: null, date: '2026-06-02', amount_eur: 300 }),
        tx({ id: '2', category_id: 'gone', date: '2026-06-03', amount_eur: 200 }),
      ],
      cats,
      NOW,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe('uncategorized');
    expect(rows[0]!.name).toBe('Other');
    expect(rows[0]!.icon).toBe('category');
    expect(rows[0]!.totalCents).toBe(500);
  });

  it('returns an empty array when there is no current-month spend', () => {
    expect(spendingByCategory([tx({ date: '2026-05-01' })], cats, NOW)).toEqual([]);
  });
});

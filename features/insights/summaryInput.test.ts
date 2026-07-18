import type { CategoryLite } from '@/features/transactions/groupByDay';
import type { Transaction } from '@/features/transactions/types';
import { buildSummaryInput } from './summaryInput';

const NOW = new Date(2026, 5, 15); // Jun 2026
const cats: CategoryLite[] = [
  { id: 'c1', name: 'Groceries', icon: 'shopping-basket', color: '#adc7ff', kind: 'expense' },
  { id: 'c2', name: 'Beverages', icon: 'local-cafe', color: '#d8e3ff', kind: 'expense' },
];

function tx(p: Partial<Transaction> & { id: string }): Transaction {
  return {
    household_id: 'h', user_id: 'u', amount_eur: 1000,
    original_amount: null, original_currency: null, merchant: 'M',
    category_id: 'c1', date: '2026-06-10', note: null, source: 'manual', kind: 'expense',
    receipt_id: null, is_flagged: false, occurred_at: null,
    created_at: '2026-06-10T00:00:00.000Z', ...p,
  };
}

describe('buildSummaryInput', () => {
  it('computes totals, pct, top category and top merchant for the current month', () => {
    const r = buildSummaryInput(
      [
        tx({ id: '1', date: '2026-06-02', amount_eur: 3000, category_id: 'c1', merchant: 'Kaufland' }),
        tx({ id: '2', date: '2026-06-09', amount_eur: 1000, category_id: 'c2', merchant: 'Starbucks' }),
        tx({ id: '3', date: '2026-05-20', amount_eur: 2000, category_id: 'c1', merchant: 'Kaufland' }), // last month
      ],
      cats,
      NOW,
    );
    expect(r.monthTotalCents).toBe(4000);
    expect(r.prevMonthTotalCents).toBe(2000);
    expect(r.pctChange).toBe(100);
    expect(r.topCategory).toEqual({ name: 'Groceries', totalCents: 3000 });
    expect(r.topMerchant).toEqual({ merchant: 'Kaufland', totalCents: 3000 });
  });

  it('returns null pct and null top fields when there is no spend', () => {
    const r = buildSummaryInput([tx({ id: 'x', date: '2026-04-01' })], cats, NOW);
    expect(r.monthTotalCents).toBe(0);
    expect(r.prevMonthTotalCents).toBe(0);
    expect(r.pctChange).toBeNull();
    expect(r.topCategory).toBeNull();
    expect(r.topMerchant).toBeNull();
  });
});

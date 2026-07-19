import { groupTransactionsByDay, monthTotalCents, toTransactionView } from './groupByDay';
import { formatTime } from '@/lib/dates';
import type { Transaction } from './types';

const cats = [
  { id: 'c1', name: 'Groceries', icon: 'shopping-basket', color: '#adc7ff', kind: 'expense' as const },
  { id: 'c2', name: 'Beverages', icon: 'local-cafe', color: '#d8e3ff', kind: 'expense' as const },
];

function tx(p: Partial<Transaction>): Transaction {
  return {
    id: 'id',
    household_id: 'h',
    user_id: 'u',
    amount_eur: 1000,
    original_amount: null,
    original_currency: null,
    merchant: 'Test',
    category_id: 'c1',
    date: '2026-06-22',
    note: null,
    source: 'manual',
    kind: 'expense',
    receipt_id: null,
    is_flagged: false,
    occurred_at: null,
    created_at: '2026-06-22T08:30:00.000Z',
    ...p,
  };
}

const NOW = new Date(2026, 5, 22); // 22 Jun 2026, local

describe('toTransactionView', () => {
  const byId = new Map(cats.map((c) => [c.id, c]));

  it('maps category icon, color and a "name • time" meta', () => {
    const v = toTransactionView(tx({ id: 'a', merchant: 'Billa' }), byId, NOW);
    expect(v.id).toBe('a');
    expect(v.merchant).toBe('Billa');
    expect(v.icon).toBe('shopping-basket');
    expect(v.iconColor).toBe('#adc7ff');
    expect(v.amountCents).toBe(1000);
    expect(v.meta.startsWith('Groceries')).toBe(true);
  });

  it('falls back to an Other-style glyph when category is missing', () => {
    const v = toTransactionView(tx({ id: 'b', category_id: null }), byId, NOW);
    expect(v.icon).toBe('category');
    expect(v.iconColor).toBe('#8e909a');
  });

  it('carries the flagged state through', () => {
    const v = toTransactionView(tx({ id: 'c', is_flagged: true }), byId, NOW);
    expect(v.isFlagged).toBe(true);
  });

  it('uses occurred_at for the time when present, not created_at', () => {
    const occurred = new Date(2026, 5, 22, 21, 48).toISOString();
    const v = toTransactionView(
      tx({ id: 'occ', occurred_at: occurred, created_at: '2026-06-22T03:00:00.000Z' }),
      byId,
      NOW,
    );
    expect(v.meta).toBe(`Groceries • ${formatTime(new Date(occurred))}`);
  });

  it('populates flagReason from the reasons map for a flagged tx', () => {
    const reasons = new Map([['c', 'Над обичайното']]);
    const v = toTransactionView(tx({ id: 'c', is_flagged: true }), byId, NOW, reasons);
    expect(v.flagReason).toBe('Над обичайното');
  });

  it('leaves flagReason undefined for an unflagged tx even if a reason exists', () => {
    const reasons = new Map([['d', 'Над обичайното']]);
    const v = toTransactionView(tx({ id: 'd', is_flagged: false }), byId, NOW, reasons);
    expect(v.flagReason).toBeUndefined();
  });

  it('maps kind income → isIncome view flag', () => {
    const view = toTransactionView(tx({ kind: 'income' }), new Map());
    expect(view.isIncome).toBe(true);
    expect(toTransactionView(tx({ kind: 'expense' }), new Map()).isIncome).toBe(false);
  });
});

describe('groupTransactionsByDay', () => {
  it('groups by date with a relative-day label, newest day first', () => {
    const groups = groupTransactionsByDay(
      [
        tx({ id: 'today', date: '2026-06-22' }),
        tx({ id: 'yest', date: '2026-06-21' }),
        tx({ id: 'today2', date: '2026-06-22' }),
      ],
      cats,
      NOW,
    );
    expect(groups).toHaveLength(2);
    expect(groups[0]!.label).toBe('Днес');
    expect(groups[0]!.items.map((i) => i.id)).toEqual(['today', 'today2']);
    expect(groups[1]!.label).toBe('Вчера');
  });

  it('returns an empty array for no transactions', () => {
    expect(groupTransactionsByDay([], cats, NOW)).toEqual([]);
  });
});

describe('monthTotalCents', () => {
  it('sums only the current calendar month', () => {
    const total = monthTotalCents(
      [
        tx({ id: '1', date: '2026-06-01', amount_eur: 500 }),
        tx({ id: '2', date: '2026-06-30', amount_eur: 1500 }),
        tx({ id: '3', date: '2026-05-31', amount_eur: 9999 }), // previous month, excluded
      ],
      NOW,
    );
    expect(total).toBe(2000);
  });
});

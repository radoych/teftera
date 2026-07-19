import { buildReportData, monthPickerOptions } from './reportData';
import type { BuildReportInput } from './types';
import type { Transaction } from '@/features/transactions/types';
import type { CategoryLite } from '@/features/transactions/groupByDay';

const cats: CategoryLite[] = [
  { id: 'groc', name: 'Хранителни', icon: 'shopping-cart', color: '#adc7ff', kind: 'expense' },
  { id: 'fun', name: 'Забавления', icon: 'movie', color: '#ffdfa7', kind: 'expense' },
];

function tx(over: Partial<Transaction>): Transaction {
  return {
    id: 't', household_id: 'h', user_id: 'u', amount_eur: 1000,
    original_amount: null, original_currency: null, merchant: 'Kaufland',
    category_id: 'groc', date: '2026-06-10', note: null, source: 'manual', kind: 'expense',
    receipt_id: null, is_flagged: false, occurred_at: null, created_at: '2026-06-10T00:00:00Z',
    ...over,
  };
}

const base: Omit<BuildReportInput, 'month'> = {
  transactions: [
    tx({ id: 'a', amount_eur: 3000, category_id: 'groc', merchant: 'Kaufland', date: '2026-06-05' }),
    tx({ id: 'b', amount_eur: 1000, category_id: 'fun', merchant: 'Kino', date: '2026-06-20' }),
    tx({ id: 'c', amount_eur: 2000, category_id: 'groc', merchant: 'Lidl', date: '2026-05-15' }),
  ],
  categories: cats,
  budgetRows: [{ id: 'bd', household_id: 'h', category_id: 'groc', amount_eur: 5000, month: '2026-06-01' }],
  openAnomalies: [{ id: 'an', transactionId: 'a', reason: 'Над обичайното', score: 3.1 }],
  now: new Date(2026, 6, 1), // July 2026 → June is a PAST month
  aiSummaryText: 'Тестово обобщение',
};

describe('buildReportData', () => {
  const data = buildReportData({ ...base, month: new Date(2026, 5, 15) }); // June 2026

  it('totals only the target month in cents', () => {
    expect(data.totalCents).toBe(4000); // 3000 + 1000, excludes the May row
  });

  it('computes pct vs previous month', () => {
    expect(data.pctVsPrevMonth).toBe(100); // 4000 vs 2000 (May) → +100%
  });

  it('gives each category its share of the month total', () => {
    const groc = data.categories.find((c) => c.name === 'Хранителни');
    expect(groc?.totalCents).toBe(3000);
    expect(groc?.share).toBeCloseTo(0.75, 5);
  });

  it('maps budgets for the target month', () => {
    const b = data.budgets.find((x) => x.name === 'Хранителни');
    expect(b).toMatchObject({ budgetCents: 5000, spentCents: 3000, state: 'under' });
  });

  it('includes only the month\'s anomalies', () => {
    expect(data.anomalies).toEqual([{ merchant: 'Kaufland', amountCents: 3000, reason: 'Над обичайното' }]);
  });

  it('omits the AI summary for a past month', () => {
    expect(data.aiSummary).toBeNull();
  });

  it('includes the AI summary when the month is the current month', () => {
    const cur = buildReportData({ ...base, month: new Date(2026, 6, 3), now: new Date(2026, 6, 3) });
    expect(cur.aiSummary).toBe('Тестово обобщение');
  });

  it('labels the month in bg-BG', () => {
    expect(data.monthLabel.startsWith('Юни')).toBe(true);
    expect(data.monthISO).toBe('2026-06');
  });
});

describe('income exclusion', () => {
  it('income is excluded from spend sections and reported as incomeTotalCents', () => {
    const incomeMerchantName = 'Salary Inc';
    const input: BuildReportInput = {
      ...base,
      transactions: [
        tx({ id: 'exp', amount_eur: 1000, category_id: 'groc', merchant: 'Kaufland', date: '2026-06-05' }),
        tx({ id: 'inc', amount_eur: 5000, category_id: null, merchant: incomeMerchantName, date: '2026-06-06', kind: 'income' }),
      ],
      month: new Date(2026, 5, 15), // June 2026
    };
    const data = buildReportData(input);
    expect(data.totalCents).toBe(1000);
    expect(data.incomeTotalCents).toBe(5000);
    expect(data.merchants.every((m) => m.merchant !== incomeMerchantName)).toBe(true);
  });
});

describe('monthPickerOptions', () => {
  it('returns the last 12 months, current first', () => {
    const opts = monthPickerOptions(new Date(2026, 6, 1));
    expect(opts).toHaveLength(12);
    expect(opts[0]!.monthISO).toBe('2026-07');
    expect(opts[11]!.monthISO).toBe('2025-08');
  });
});

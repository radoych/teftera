import type { OpenAnomaly } from '@/features/anomalies/api';
import type { BudgetRow } from '@/features/budgets/types';
import type { CategoryLite, Transaction } from '@/features/transactions/types';
import { deriveInsights, type InsightsInput } from './deriveInsights';

const NOW = new Date(2026, 5, 15); // 15 Jun 2026, local

const cats: CategoryLite[] = [
  { id: 'food', name: 'Храна', icon: 'restaurant', color: '#adc7ff', kind: 'expense' },
  { id: 'fuel', name: 'Гориво', icon: 'local-gas-station', color: '#d8e3ff', kind: 'expense' },
  { id: 'pay', name: 'Заплата', icon: 'payments', color: '#ffdfa7', kind: 'income' },
];

function tx(p: Partial<Transaction> & { id: string; date: string }): Transaction {
  return {
    household_id: 'h', user_id: 'u1', amount_eur: 100,
    original_amount: null, original_currency: null, merchant: 'M',
    category_id: null, note: null, source: 'manual', kind: 'expense', receipt_id: null,
    is_flagged: false, occurred_at: null, created_at: `${p.date}T00:00:00.000Z`,
    ...p,
  };
}

const txs: Transaction[] = [
  tx({ id: 't1', date: '2026-06-02', user_id: 'u1', category_id: 'food', amount_eur: 3000, merchant: 'Lidl' }),
  tx({ id: 't2', date: '2026-06-10', user_id: 'u2', category_id: 'fuel', amount_eur: 5000, merchant: 'OMV' }),
  tx({ id: 't3', date: '2026-06-12', user_id: 'u1', category_id: 'food', amount_eur: 1000, merchant: 'Lidl' }),
  tx({ id: 't4', date: '2026-05-20', user_id: 'u1', category_id: 'food', amount_eur: 2000, merchant: 'Kaufland' }),
  tx({ id: 't5', date: '2026-05-25', user_id: 'u2', category_id: 'fuel', amount_eur: 6000, merchant: 'OMV' }),
  tx({ id: 't6', date: '2026-03-05', user_id: 'u1', category_id: null, amount_eur: 1500, merchant: 'Misc' }),
  tx({ id: 'i1', date: '2026-06-01', user_id: 'u1', category_id: 'pay', amount_eur: 100000, merchant: 'Salary', kind: 'income' }),
  tx({ id: 'i2', date: '2026-05-01', user_id: 'u2', category_id: 'pay', amount_eur: 50000, merchant: 'Salary', kind: 'income' }),
];

const budgets: BudgetRow[] = [
  { id: 'b1', household_id: 'h', category_id: 'food', amount_eur: 5000, month: '2026-06-01' },
  { id: 'b2', household_id: 'h', category_id: 'fuel', amount_eur: 4000, month: '2026-01-01' },
];

const anomalies: OpenAnomaly[] = [
  { id: 'a1', transactionId: 't2', reason: 'Над обичайното', score: 3.1 },
  { id: 'a2', transactionId: 'deleted-tx', reason: 'orphan', score: 2.9 },
];

function input(p: Partial<InsightsInput> = {}): InsightsInput {
  return {
    transactions: txs,
    categories: cats,
    openAnomalies: anomalies,
    budgets,
    userId: 'u1',
    scope: 'household',
    range: 'this_month',
    now: NOW,
    budgetMonth: NOW,
    ...p,
  };
}

describe('deriveInsights — household, this month', () => {
  const out = deriveInsights(input());

  it('hero: range expenses, income and % vs last month', () => {
    // Jun expenses 9000 vs May 8000 → +12.5% → 13
    expect(out.hero).toEqual({ totalCents: 9000, incomeCents: 100000, comparisonPct: 13 });
  });

  it('category breakdown of the range, largest first', () => {
    expect(out.categoryRows.map((r) => [r.id, r.totalCents, r.fraction])).toEqual([
      ['fuel', 5000, 1],
      ['food', 4000, 0.8],
    ]);
  });

  it('top merchants of the range', () => {
    expect(out.merchants).toEqual([
      { merchant: 'OMV', totalCents: 5000 },
      { merchant: 'Lidl', totalCents: 4000 },
    ]);
  });

  it('six-month trend ending at now, expenses only', () => {
    expect(out.trend.map((m) => [m.label, m.totalCents, m.isCurrent])).toEqual([
      ['ЯНУ', 0, false],
      ['ФЕВ', 0, false],
      ['МАР', 1500, false],
      ['АПР', 0, false],
      ['МАЙ', 8000, false],
      ['ЮНИ', 9000, true],
    ]);
  });

  it('budget progress for the budget month, carried forward, pct desc', () => {
    expect(out.budgetRows).toEqual([
      { categoryId: 'fuel', budgetCents: 4000, spentCents: 5000, pct: 125, state: 'over' },
      { categoryId: 'food', budgetCents: 5000, spentCents: 4000, pct: 80, state: 'warning' },
    ]);
  });

  it('anomaly cards join their transaction and drop orphans', () => {
    expect(out.anomalyCards).toEqual([
      { id: 'a1', transactionId: 't2', merchant: 'OMV', amountCents: 5000, reason: 'Над обичайното' },
    ]);
  });

  it('indexes categories by id', () => {
    expect([...out.categoryById.keys()]).toEqual(['food', 'fuel', 'pay']);
  });
});

describe('deriveInsights — scope', () => {
  const out = deriveInsights(input({ scope: 'me' }));

  it('narrows hero, income, trend and lists to the user', () => {
    expect(out.hero).toEqual({ totalCents: 4000, incomeCents: 100000, comparisonPct: 100 });
    expect(out.merchants).toEqual([{ merchant: 'Lidl', totalCents: 4000 }]);
    expect(out.trend.map((m) => m.totalCents)).toEqual([0, 0, 1500, 0, 2000, 4000]);
  });

  it('does NOT narrow budgets (always the whole household)', () => {
    expect(out.budgetRows).toEqual(deriveInsights(input()).budgetRows);
  });

  it('a null userId with scope "me" falls back to the household', () => {
    expect(deriveInsights(input({ scope: 'me', userId: null })).hero.totalCents).toBe(9000);
  });
});

describe('deriveInsights — time bases are independent', () => {
  it('range widens the window and its comparison window', () => {
    const out = deriveInsights(input({ range: 'last_3_months' }));
    // Apr–Jun 17000 vs Jan–Mar 1500
    expect(out.hero).toEqual({ totalCents: 17000, incomeCents: 150000, comparisonPct: 1033 });
  });

  it('range does not move the trend or the budgets', () => {
    const base = deriveInsights(input());
    const lastMonth = deriveInsights(input({ range: 'last_month' }));
    expect(lastMonth.hero.totalCents).toBe(8000);
    expect(lastMonth.hero.comparisonPct).toBeNull(); // April is empty
    expect(lastMonth.trend).toEqual(base.trend);
    expect(lastMonth.budgetRows).toEqual(base.budgetRows);
  });

  it('budgetMonth alone selects the budget month', () => {
    const out = deriveInsights(input({ budgetMonth: new Date(2026, 4, 3) }));
    // May: food budget starts in June (not resolved); fuel carried 4000 vs 6000
    expect(out.budgetRows).toEqual([
      { categoryId: 'fuel', budgetCents: 4000, spentCents: 6000, pct: 150, state: 'over' },
    ]);
    expect(out.hero.totalCents).toBe(9000);
  });

  it('empty input yields empty sections and a null comparison', () => {
    const out = deriveInsights(input({ transactions: [], openAnomalies: [], budgets: [] }));
    expect(out.hero).toEqual({ totalCents: 0, incomeCents: 0, comparisonPct: null });
    expect(out.categoryRows).toEqual([]);
    expect(out.merchants).toEqual([]);
    expect(out.budgetRows).toEqual([]);
    expect(out.anomalyCards).toEqual([]);
    expect(out.trend.every((m) => m.totalCents === 0 && m.fraction === 0)).toBe(true);
  });
});

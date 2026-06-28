import type { Transaction } from '@/features/transactions/types';
import { evaluate, historyForCategory } from './detect';

function tx(p: Partial<Transaction> & { id: string }): Transaction {
  return {
    id: p.id, household_id: 'h', user_id: 'u', amount_eur: 1000,
    original_amount: null, original_currency: null, merchant: 'M',
    category_id: 'c1', date: '2026-06-01', note: null, source: 'manual',
    receipt_id: null, is_flagged: false, occurred_at: null,
    created_at: '2026-06-01T00:00:00.000Z', ...p,
  };
}

describe('historyForCategory', () => {
  it('keeps same-category amounts and excludes the scored tx', () => {
    const txs = [
      tx({ id: 'a', category_id: 'c1', amount_eur: 100 }),
      tx({ id: 'b', category_id: 'c1', amount_eur: 200 }),
      tx({ id: 'c', category_id: 'c2', amount_eur: 999 }),
      tx({ id: 'self', category_id: 'c1', amount_eur: 5000 }),
    ];
    expect(historyForCategory(txs, 'c1', 'self')).toEqual([100, 200]);
  });
  it('matches the uncategorized (null) bucket', () => {
    const txs = [tx({ id: 'a', category_id: null, amount_eur: 100 }), tx({ id: 'b', category_id: 'c1' })];
    expect(historyForCategory(txs, null, 'x')).toEqual([100]);
  });
});

describe('evaluate', () => {
  it('flags a 3x outlier once there are >= 4 prior samples', () => {
    const r = evaluate(3000, [800, 1000, 1200, 1000]);
    expect(r.isAnomaly).toBe(true);
    expect(r.reason).not.toBeNull();
  });
  it('does not flag below the minimum sample size', () => {
    const r = evaluate(9999, [800, 1000, 1200]);
    expect(r.isAnomaly).toBe(false);
    expect(r.reason).toBeNull();
  });
});

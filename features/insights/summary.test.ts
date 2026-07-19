import { toISODate } from '@/lib/dates';
import type { CategoryLite } from '@/features/transactions/groupByDay';
import type { Transaction } from '@/features/transactions/types';
import { refreshSummary } from './summary';

const cats: CategoryLite[] = [
  { id: 'c1', name: 'Groceries', icon: 'shopping-basket', color: '#adc7ff', kind: 'expense' },
];

function tx(p: Partial<Transaction> & { id: string }): Transaction {
  return {
    household_id: 'h', user_id: 'u', amount_eur: 1000,
    original_amount: null, original_currency: null, merchant: 'M',
    category_id: 'c1', date: toISODate(), note: null, source: 'manual', kind: 'expense',
    receipt_id: null, is_flagged: false, occurred_at: null,
    created_at: new Date().toISOString(), ...p,
  };
}

// Today-dated so buildSummaryInput sees non-zero current-month spend regardless of run date.
const withSpend: Transaction[] = [tx({ id: '1', amount_eur: 1000 })];

function fakes() {
  const calls: string[] = [];
  return {
    calls,
    setLoading: jest.fn(() => calls.push('loading')),
    setReady: jest.fn((_t: string) => calls.push('ready')),
    setError: jest.fn(() => calls.push('error')),
  };
}

describe('refreshSummary', () => {
  it('sets loading then ready with the generated text', async () => {
    const f = fakes();
    const generate = jest.fn(async () => 'Похарчихте €820 този месец.');
    await refreshSummary(withSpend, cats, { generate, setLoading: f.setLoading, setReady: f.setReady, setError: f.setError });
    expect(f.calls).toEqual(['loading', 'ready']);
    expect(f.setReady).toHaveBeenCalledWith('Похарчихте €820 този месец.');
  });

  it('sets loading then error when generation returns null', async () => {
    const f = fakes();
    const generate = jest.fn(async () => null);
    await refreshSummary(withSpend, cats, { generate, setLoading: f.setLoading, setReady: f.setReady, setError: f.setError });
    expect(f.calls).toEqual(['loading', 'error']);
  });

  it('swallows a thrown generator error → error status (never rejects)', async () => {
    const f = fakes();
    const generate = jest.fn(async () => {
      throw new Error('boom');
    });
    await expect(
      refreshSummary(withSpend, cats, { generate, setLoading: f.setLoading, setReady: f.setReady, setError: f.setError }),
    ).resolves.toBeUndefined();
    expect(f.calls).toEqual(['loading', 'error']);
  });

  it('hides (error, without calling generate or flashing loading) when there is no current-month spend', async () => {
    const f = fakes();
    const generate = jest.fn(async () => 'should not be called');
    await refreshSummary([], cats, { generate, setLoading: f.setLoading, setReady: f.setReady, setError: f.setError });
    expect(generate).not.toHaveBeenCalled();
    expect(f.calls).toEqual(['error']);
  });
});

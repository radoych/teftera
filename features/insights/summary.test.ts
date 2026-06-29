import type { CategoryLite } from '@/features/transactions/groupByDay';
import type { Transaction } from '@/features/transactions/types';
import { refreshSummary } from './summary';

const cats: CategoryLite[] = [{ id: 'c1', name: 'Groceries', icon: 'shopping-basket', color: '#adc7ff' }];
const txs: Transaction[] = [];

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
    await refreshSummary(txs, cats, {
      generate,
      setLoading: f.setLoading,
      setReady: f.setReady,
      setError: f.setError,
    });
    expect(f.calls).toEqual(['loading', 'ready']);
    expect(f.setReady).toHaveBeenCalledWith('Похарчихте €820 този месец.');
  });

  it('sets loading then error when generation returns null', async () => {
    const f = fakes();
    const generate = jest.fn(async () => null);
    await refreshSummary(txs, cats, {
      generate,
      setLoading: f.setLoading,
      setReady: f.setReady,
      setError: f.setError,
    });
    expect(f.calls).toEqual(['loading', 'error']);
  });

  it('swallows a thrown generator error → error status (never rejects)', async () => {
    const f = fakes();
    const generate = jest.fn(async () => {
      throw new Error('boom');
    });
    await expect(
      refreshSummary(txs, cats, {
        generate,
        setLoading: f.setLoading,
        setReady: f.setReady,
        setError: f.setError,
      }),
    ).resolves.toBeUndefined();
    expect(f.calls).toEqual(['loading', 'error']);
  });
});

import type { Transaction } from '@/features/transactions/types';
import type { NewAnomaly } from './api';
import { runDetection, type RunDetectionInput } from './runDetection';

function tx(p: Partial<Transaction> & { id: string }): Transaction {
  return {
    household_id: 'h', user_id: 'u', amount_eur: 1000,
    original_amount: null, original_currency: null, merchant: 'M',
    category_id: 'c1', date: '2026-06-01', note: null, source: 'manual',
    receipt_id: null, is_flagged: false, occurred_at: null,
    created_at: '2026-06-01T00:00:00.000Z', ...p,
  };
}

const history = [
  tx({ id: 'a', amount_eur: 800 }),
  tx({ id: 'b', amount_eur: 1000 }),
  tx({ id: 'c', amount_eur: 1200 }),
  tx({ id: 'd', amount_eur: 1000 }),
];

function input(amountCents: number): RunDetectionInput {
  return {
    transactionId: 'new',
    householdId: 'h',
    amountCents,
    categoryId: 'c1',
    transactions: [...history, tx({ id: 'new', amount_eur: amountCents })],
  };
}

describe('runDetection', () => {
  it('flags and records an anomaly for an outlier', async () => {
    const flagTransaction = jest.fn(async (_id: string) => {});
    const insertAnomaly = jest.fn(async (_input: NewAnomaly) => {});
    await runDetection(input(5000), { flagTransaction, insertAnomaly });
    expect(flagTransaction).toHaveBeenCalledWith('new');
    expect(insertAnomaly).toHaveBeenCalledTimes(1);
    const arg = insertAnomaly.mock.calls[0]![0];
    expect(arg.transactionId).toBe('new');
    expect(arg.householdId).toBe('h');
    expect(typeof arg.reason).toBe('string');
  });

  it('persists nothing for a normal amount', async () => {
    const flagTransaction = jest.fn(async (_id: string) => {});
    const insertAnomaly = jest.fn(async (_input: NewAnomaly) => {});
    await runDetection(input(1000), { flagTransaction, insertAnomaly });
    expect(flagTransaction).not.toHaveBeenCalled();
    expect(insertAnomaly).not.toHaveBeenCalled();
  });

  it('swallows a persist error (never rejects)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const flagTransaction = jest.fn(async (_id: string) => {
      throw new Error('db down');
    });
    const insertAnomaly = jest.fn(async (_input: NewAnomaly) => {});
    await expect(runDetection(input(5000), { flagTransaction, insertAnomaly })).resolves.toBeUndefined();
    expect(insertAnomaly).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

import type { Transaction } from '@/features/transactions/types';
import type { NewAnomaly } from './api';
import { runDetection, type RunDetectionInput } from './runDetection';

function tx(p: Partial<Transaction> & { id: string }): Transaction {
  return {
    household_id: 'h', user_id: 'u', amount_eur: 1000,
    original_amount: null, original_currency: null, merchant: 'M',
    category_id: 'c1', date: '2026-06-01', note: null, source: 'manual', kind: 'expense',
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

function deps() {
  return {
    flagTransaction: jest.fn(async (_id: string) => {}),
    insertAnomaly: jest.fn(async (_input: NewAnomaly) => {}),
    notify: jest.fn(async (_input: { title: string; body: string }) => {}),
  };
}

describe('runDetection', () => {
  it('flags and records an anomaly for an outlier', async () => {
    const d = deps();
    await runDetection(input(5000), d);
    expect(d.flagTransaction).toHaveBeenCalledWith('new');
    expect(d.insertAnomaly).toHaveBeenCalledTimes(1);
    const arg = d.insertAnomaly.mock.calls[0]![0];
    expect(arg.transactionId).toBe('new');
    expect(arg.householdId).toBe('h');
    expect(arg.reason).toMatch(/^Над обичайното за тази категория \(z=\d+\.\d\)$/);
  });

  it('persists nothing for a normal amount', async () => {
    const d = deps();
    await runDetection(input(1000), d);
    expect(d.flagTransaction).not.toHaveBeenCalled();
    expect(d.insertAnomaly).not.toHaveBeenCalled();
  });

  it('swallows a persist error (never rejects)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const d = deps();
    d.flagTransaction.mockImplementation(async () => {
      throw new Error('db down');
    });
    await expect(runDetection(input(5000), d)).resolves.toBeUndefined();
    expect(d.insertAnomaly).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('notifies on a flagged save when alerts are enabled', async () => {
    const d = deps();
    await runDetection({ ...input(5000), merchant: 'Kaufland', alertsEnabled: true }, d);
    expect(d.notify).toHaveBeenCalledTimes(1);
    const arg = d.notify.mock.calls[0]![0];
    expect(arg.title).toBe('Необичайна транзакция');
    expect(arg.body).toContain('Kaufland');
  });

  it('does not notify when alerts are disabled or unset', async () => {
    const d = deps();
    await runDetection({ ...input(5000), merchant: 'Kaufland', alertsEnabled: false }, d);
    await runDetection(input(5000), d);
    expect(d.notify).not.toHaveBeenCalled();
  });
});

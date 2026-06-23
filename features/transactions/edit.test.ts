import { memberName, transactionToFormValues } from './edit';
import type { Transaction } from './types';

function tx(p: Partial<Transaction>): Transaction {
  return {
    id: 'id', household_id: 'h', user_id: 'u', amount_eur: 1250,
    original_amount: null, original_currency: null, merchant: 'Billa',
    category_id: 'c1', date: '2026-06-22', note: 'lunch', receipt_id: null,
    is_flagged: false, created_at: '2026-06-22T08:30:00.000Z', ...p,
  };
}

describe('transactionToFormValues', () => {
  it('formats cents as a comma-decimal major string and passes fields through', () => {
    expect(transactionToFormValues(tx({}))).toEqual({
      amount: '12,50', merchant: 'Billa', note: 'lunch',
      date: '2026-06-22', categoryId: 'c1',
    });
  });

  it('maps a null note to an empty string', () => {
    expect(transactionToFormValues(tx({ note: null })).note).toBe('');
  });

  it('keeps a null category id', () => {
    expect(transactionToFormValues(tx({ category_id: null })).categoryId).toBeNull();
  });

  it('formats larger amounts without grouping separators', () => {
    expect(transactionToFormValues(tx({ amount_eur: 100000 })).amount).toBe('1000,00');
  });
});

describe('memberName', () => {
  const members = [
    { userId: 'u1', displayName: 'Радо' },
    { userId: 'u2', displayName: 'Мария' },
  ];

  it('returns the matching member display name', () => {
    expect(memberName('u2', members)).toBe('Мария');
  });

  it('returns Импорт for a null user id', () => {
    expect(memberName(null, members)).toBe('Импорт');
  });

  it('returns a dash for an unknown user id', () => {
    expect(memberName('ghost', members)).toBe('—');
  });
});

import type { Transaction } from './types';

export interface ManualEntryFormValues {
  amount: string; // major-unit string for the amount input, e.g. "12,50"
  merchant: string;
  note: string; // '' when none
  date: string; // YYYY-MM-DD
  categoryId: string | null;
}

/**
 * Map a stored transaction to prefilled create/edit form values.
 * `amount` is display formatting of an already-stored integer (mirrors
 * formatCurrency's /100); the save path re-parses it to integer cents.
 */
export function transactionToFormValues(tx: Transaction): ManualEntryFormValues {
  return {
    amount: (tx.amount_eur / 100).toFixed(2).replace('.', ','),
    merchant: tx.merchant,
    note: tx.note ?? '',
    date: tx.date,
    categoryId: tx.category_id,
  };
}

/** Resolve a member display name from a user id; null id -> 'Импорт', unknown -> '—'. */
export function memberName(
  userId: string | null,
  members: ReadonlyArray<{ userId: string; displayName: string }>,
): string {
  if (userId === null) return 'Импорт';
  const match = members.find((m) => m.userId === userId);
  return match ? match.displayName : '—';
}

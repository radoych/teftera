import type { MaterialIconName } from '@/lib/categories';

/** Mirrors the `transactions` table. Amounts are integer EUR cents. */
export interface Transaction {
  id: string;
  household_id: string;
  user_id: string | null;
  amount_eur: number;
  original_amount: number | null;
  original_currency: string | null;
  merchant: string;
  category_id: string | null;
  date: string; // YYYY-MM-DD
  note: string | null;
  source: 'manual' | 'dsk_import' | 'receipt';
  kind: 'expense' | 'income';
  receipt_id: string | null;
  is_flagged: boolean;
  occurred_at: string | null; // actual transaction time; falls back to created_at for display
  created_at: string;
}

/** A transaction joined with its category presentation for rendering. */
export interface TransactionView {
  id: string;
  merchant: string;
  meta: string;
  amountCents: number;
  icon: MaterialIconName;
  iconColor: string;
  isFlagged: boolean;
  flagReason?: string;
  isIncome?: boolean;
}

/** A day's worth of transactions for the grouped list. */
export interface TransactionDayGroup {
  label: string;
  items: TransactionView[];
}

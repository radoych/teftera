import type { MaterialIconName } from '@/lib/categories';
import type { Tables } from '@/supabase/types';
import type { TxKind } from './kind';

/** Where a transaction came from. The DB column is plain text; this is the app's contract. */
export type TxSource = 'manual' | 'dsk_import' | 'receipt';

/**
 * One `transactions` row, derived from the generated schema (`supabase/types.ts`) so
 * column renames / nullability changes are compile errors. Amounts are integer EUR
 * cents; `date` is YYYY-MM-DD; `occurred_at` is the actual transaction time (display
 * falls back to `created_at`). `kind` / `source` are text in Postgres and narrowed here.
 */
export interface Transaction extends Omit<Tables<'transactions'>, 'kind' | 'source'> {
  kind: TxKind;
  source: TxSource;
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

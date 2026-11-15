// features/transactions/rows.ts — narrow generated DB rows to the app's types.
// Postgres stores `kind` / `source` as plain text, so the generated Row types say
// `string`; these are the single place that string becomes a union.
import type { Tables } from '@/supabase/types';
import type { CategoryLite } from './groupByDay';
import type { TxKind } from './kind';
import type { Transaction, TxSource } from './types';

/** `'income'` stays income; anything else is an expense (the column default). */
export function parseTxKind(value: string): TxKind {
  return value === 'income' ? 'income' : 'expense';
}

/** Known sources pass through; anything unexpected is treated as manual entry. */
export function parseTxSource(value: string): TxSource {
  return value === 'dsk_import' || value === 'receipt' ? value : 'manual';
}

export function toTransaction(row: Tables<'transactions'>): Transaction {
  return { ...row, kind: parseTxKind(row.kind), source: parseTxSource(row.source) };
}

export function toCategoryLite(
  row: Pick<Tables<'categories'>, 'id' | 'name' | 'icon' | 'color' | 'is_default' | 'kind'>,
): CategoryLite {
  return { ...row, kind: parseTxKind(row.kind) };
}

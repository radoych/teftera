// features/transactions/api.ts — the ONLY module that reads/writes transactions.
import { supabase } from '@/services/supabase';
import type { CategoryLite } from './groupByDay';
import type { Transaction } from './types';

export interface NewTransaction {
  householdId: string;
  userId: string | null;
  amountCents: number;
  merchant: string;
  categoryId: string | null;
  date: string; // YYYY-MM-DD
  note: string | null;
  receiptId?: string | null;
}

/** The household's categories, name-ascending. */
export async function listCategories(householdId: string): Promise<CategoryLite[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, icon, color, is_default')
    .eq('household_id', householdId)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CategoryLite[];
}

/** Create a household category. */
export async function createCategory(input: {
  householdId: string;
  name: string;
  icon: string;
  color: string;
}): Promise<void> {
  const { error } = await supabase.from('categories').insert({
    household_id: input.householdId,
    name: input.name,
    icon: input.icon,
    color: input.color,
    is_default: false,
  });
  if (error) throw error;
}

/** Rename / restyle a category. RLS scopes by household. */
export async function updateCategory(
  id: string,
  patch: { name: string; icon: string; color: string },
): Promise<void> {
  const { error } = await supabase.from('categories').update(patch).eq('id', id);
  if (error) throw error;
}

/** Delete a category. Its transactions survive: the FK is `on delete set null`. */
export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}

/** All transactions for a household, newest first. */
export async function listTransactions(householdId: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('household_id', householdId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Transaction[];
}

/** A normalized imported row, carrying its BGN provenance when converted. */
export interface ImportedTransaction {
  householdId: string;
  userId: string | null;
  amountCents: number;
  originalAmountCents: number | null;
  originalCurrency: string | null;
  merchant: string;
  categoryId: string | null;
  date: string; // YYYY-MM-DD
  occurredAt: string; // ISO timestamp of the actual transaction
  note: string | null;
}

/** Insert many imported transactions in a single batch (DSK CSV import). */
export async function bulkInsertImported(rows: ImportedTransaction[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from('transactions').insert(
    rows.map((r) => ({
      household_id: r.householdId,
      user_id: r.userId,
      amount_eur: r.amountCents,
      original_amount: r.originalAmountCents,
      original_currency: r.originalCurrency,
      merchant: r.merchant,
      category_id: r.categoryId,
      date: r.date,
      occurred_at: r.occurredAt,
      note: r.note,
      source: 'dsk_import',
    })),
  );
  if (error) throw error;
}

/** Insert one expense. EUR-native, so original_amount/currency stay null. Returns the new id. */
export async function createTransaction(input: NewTransaction): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      household_id: input.householdId,
      user_id: input.userId,
      amount_eur: input.amountCents,
      original_amount: null,
      original_currency: null,
      merchant: input.merchant,
      category_id: input.categoryId,
      date: input.date,
      note: input.note,
      receipt_id: input.receiptId ?? null,
      source: input.receiptId ? 'receipt' : 'manual',
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: (data as { id: string }).id };
}

export interface TransactionPatch {
  amountCents: number;
  merchant: string;
  categoryId: string | null;
  date: string; // YYYY-MM-DD
  note: string | null;
}

/** Update an existing transaction's editable fields. RLS scopes by household. */
export async function updateTransaction(id: string, patch: TransactionPatch): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .update({
      amount_eur: patch.amountCents,
      merchant: patch.merchant,
      category_id: patch.categoryId,
      date: patch.date,
      note: patch.note,
    })
    .eq('id', id);
  if (error) throw error;
}

/** Delete a transaction by id. RLS scopes by household. */
export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
}

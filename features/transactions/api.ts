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
}

/** The household's categories, name-ascending. */
export async function listCategories(householdId: string): Promise<CategoryLite[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, icon, color')
    .eq('household_id', householdId)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CategoryLite[];
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

/** Insert one expense. EUR-native, so original_amount/currency stay null. */
export async function createTransaction(input: NewTransaction): Promise<void> {
  const { error } = await supabase.from('transactions').insert({
    household_id: input.householdId,
    user_id: input.userId,
    amount_eur: input.amountCents,
    original_amount: null,
    original_currency: null,
    merchant: input.merchant,
    category_id: input.categoryId,
    date: input.date,
    note: input.note,
  });
  if (error) throw error;
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

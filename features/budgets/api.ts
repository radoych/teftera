// features/budgets/api.ts — the ONLY module that reads/writes the budgets table.
import { supabase } from '@/services/supabase';
import type { BudgetRow } from './types';

export async function fetchBudgets(householdId: string): Promise<BudgetRow[]> {
  const { data, error } = await supabase
    .from('budgets')
    .select('id, household_id, category_id, amount_eur, month')
    .eq('household_id', householdId);
  if (error) throw error;
  return (data ?? []) as BudgetRow[];
}

export async function upsertBudget(input: {
  householdId: string;
  categoryId: string;
  amountCents: number;
  month: string;
}): Promise<void> {
  const { error } = await supabase
    .from('budgets')
    .upsert(
      {
        household_id: input.householdId,
        category_id: input.categoryId,
        amount_eur: input.amountCents,
        month: input.month,
      },
      { onConflict: 'household_id,category_id,month' },
    );
  if (error) throw error;
}

export async function deleteBudget(input: {
  householdId: string;
  categoryId: string;
  month: string;
}): Promise<void> {
  const { error } = await supabase
    .from('budgets')
    .delete()
    .eq('household_id', input.householdId)
    .eq('category_id', input.categoryId)
    .eq('month', input.month);
  if (error) throw error;
}

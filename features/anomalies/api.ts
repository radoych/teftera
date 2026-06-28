// features/anomalies/api.ts — the ONLY module that writes anomalies / toggles is_flagged.
import { supabase } from '@/services/supabase';

export interface NewAnomaly {
  householdId: string;
  transactionId: string;
  reason: string;
  score: number;
}

export interface OpenAnomaly {
  id: string;
  transactionId: string;
  reason: string;
  score: number | null;
}

/** Insert one anomaly row. */
export async function insertAnomaly(input: NewAnomaly): Promise<void> {
  const { error } = await supabase.from('anomalies').insert({
    household_id: input.householdId,
    transaction_id: input.transactionId,
    reason: input.reason,
    score: input.score,
  });
  if (error) throw error;
}

/** Mark a transaction flagged. */
export async function flagTransaction(transactionId: string): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .update({ is_flagged: true })
    .eq('id', transactionId);
  if (error) throw error;
}

/** Unreviewed anomalies for a household, newest first. */
export async function listOpenAnomalies(householdId: string): Promise<OpenAnomaly[]> {
  const { data, error } = await supabase
    .from('anomalies')
    .select('id, transaction_id, reason, score')
    .eq('household_id', householdId)
    .eq('reviewed', false)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    transactionId: r.transaction_id as string,
    reason: r.reason as string,
    score: (r.score as number | null) ?? null,
  }));
}

/** Mark an anomaly reviewed and clear the transaction's flag. */
export async function markReviewed(anomalyId: string, transactionId: string): Promise<void> {
  const { error: aErr } = await supabase
    .from('anomalies')
    .update({ reviewed: true })
    .eq('id', anomalyId);
  if (aErr) throw aErr;
  const { error: tErr } = await supabase
    .from('transactions')
    .update({ is_flagged: false })
    .eq('id', transactionId);
  if (tErr) throw tErr;
}

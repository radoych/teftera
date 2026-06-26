// features/receipts/api.ts — the ONLY module that writes the `receipts` table.
import { supabase } from '@/services/supabase';

export interface NewReceipt {
  householdId: string;
  userId: string | null;
  storagePath: string;
  rawGeminiJson: unknown;
}

/**
 * Insert one receipt row and return its id. `processed_at` is stamped now.
 * RLS scopes the row to the household. Throws on failure.
 */
export async function insertReceipt(input: NewReceipt): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('receipts')
    .insert({
      household_id: input.householdId,
      user_id: input.userId,
      storage_path: input.storagePath,
      raw_gemini_json: input.rawGeminiJson,
      processed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: (data as { id: string }).id };
}

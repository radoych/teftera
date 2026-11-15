// features/loyalty/api.ts — the ONLY module that reads/writes `loyalty_cards`.
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';
import type { LoyaltyDatabase } from './dbTypes';
import { toLoyaltyCard } from './rows';
import type { CardFields, LoyaltyCard } from './types';

/**
 * TEMPORARY cast — the one place loyalty code steps outside the generated
 * types. `supabase/types.ts` does not know `loyalty_cards` until it is
 * regenerated after the migration is applied; until then this view of the same
 * client is typed by the hand-written `LoyaltyDatabase` (./dbTypes.ts). Replace
 * `db` with `supabase` (and delete dbTypes.ts) once the types are regenerated.
 */
const db = supabase as unknown as SupabaseClient<LoyaltyDatabase>;

/** Explicit column list — never select('*'). One literal so postgrest-js can type it. */
const CARD_COLUMNS =
  'id, household_id, vendor_id, nickname, code, code_format, color, note, created_by, created_at, updated_at' as const;

export interface NewCard extends CardFields {
  householdId: string;
  createdBy: string | null;
}

/** The household's cards, ordered vendor_id then nickname ascending. */
export async function listCards(householdId: string): Promise<LoyaltyCard[]> {
  const { data, error } = await db
    .from('loyalty_cards')
    .select(CARD_COLUMNS)
    .eq('household_id', householdId)
    .order('vendor_id', { ascending: true, nullsFirst: false })
    .order('nickname', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toLoyaltyCard);
}

/**
 * Create a card. A duplicate nickname for the same vendor rejects with the
 * Postgres unique violation — detect it with `isNicknameTakenError`.
 */
export async function createCard(input: NewCard): Promise<{ id: string }> {
  const { data, error } = await db
    .from('loyalty_cards')
    .insert({
      household_id: input.householdId,
      vendor_id: input.vendorId,
      nickname: input.nickname,
      code: input.code,
      code_format: input.codeFormat,
      color: input.color,
      note: input.note,
      created_by: input.createdBy,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id };
}

/** Update a card's editable fields. RLS scopes by household. */
export async function updateCard(id: string, patch: CardFields): Promise<void> {
  const { error } = await db
    .from('loyalty_cards')
    .update({
      vendor_id: patch.vendorId,
      nickname: patch.nickname,
      code: patch.code,
      code_format: patch.codeFormat,
      color: patch.color,
      note: patch.note,
    })
    .eq('id', id);
  if (error) throw error;
}

/** Delete a card. Shopping lists that used it keep existing without a card. */
export async function deleteCard(id: string): Promise<void> {
  const { error } = await db.from('loyalty_cards').delete().eq('id', id);
  if (error) throw error;
}

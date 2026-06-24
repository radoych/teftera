// features/preferences/api.ts — the ONLY module that reads/writes user_preferences.
import { supabase } from '@/services/supabase';
import type { UserPreferences } from './types';

/** The signed-in user's preferences row, or null when none exists yet. */
export async function getMyPreferences(userId: string): Promise<UserPreferences | null> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('settings')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.settings as UserPreferences | undefined) ?? null;
}

/** Upsert the signed-in user's preferences. RLS scopes by user_id. */
export async function upsertMyPreferences(input: {
  userId: string;
  householdId: string;
  settings: UserPreferences;
}): Promise<void> {
  const { error } = await supabase.from('user_preferences').upsert({
    user_id: input.userId,
    household_id: input.householdId,
    settings: input.settings,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

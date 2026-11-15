// features/household/api.ts
import { supabase } from '@/services/supabase';

export interface MyHousehold {
  householdId: string;
  inviteCode: string;
  displayName: string;
}

export interface HouseholdMember {
  userId: string;
  displayName: string;
  role: string;
}

/**
 * The user's household, or null if they have none yet. One round-trip: the
 * membership row embeds its household's invite code. Takes the id from the session
 * the caller already holds (no `auth.getUser()` hop). Throws on a query error so
 * bootstrap shows its retry screen instead of misrouting to household setup.
 */
export async function getMyHousehold(userId: string): Promise<MyHousehold | null> {
  const { data: membership, error } = await supabase
    .from('household_members')
    .select('household_id, display_name, households(invite_code)')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!membership) return null;
  return {
    householdId: membership.household_id,
    displayName: membership.display_name ?? '',
    inviteCode: membership.households?.invite_code ?? '',
  };
}

/** The household's invite code ('' if not visible). */
export async function getInviteCode(householdId: string): Promise<string> {
  const { data, error } = await supabase
    .from('households')
    .select('invite_code')
    .eq('id', householdId)
    .maybeSingle();
  if (error) throw error;
  return data?.invite_code ?? '';
}

/** Create a household + the creator's membership (atomic, via RPC). */
export async function createHousehold(
  name: string,
  displayName: string,
): Promise<{ householdId: string; inviteCode: string }> {
  const { data, error } = await supabase.rpc('create_household', {
    p_name: name,
    p_display_name: displayName,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('create_household RPC returned no data');
  return { householdId: row.id, inviteCode: row.invite_code };
}

/** Join a household by invite code (via RPC). Throws if the code is invalid. */
export async function joinHouseholdByCode(
  code: string,
  displayName: string,
): Promise<{ householdId: string }> {
  const { data, error } = await supabase.rpc('join_household_by_code', {
    p_code: code,
    p_display_name: displayName,
  });
  if (error) throw error;
  const householdId = Array.isArray(data) ? data[0] : data;
  if (!householdId) throw new Error('join_household_by_code RPC returned no data');
  return { householdId };
}

/** Update the current user's display name (membership row + auth metadata mirror). */
export async function updateMyDisplayName(name: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');
  const { error } = await supabase
    .from('household_members')
    .update({ display_name: name })
    .eq('user_id', user.id);
  if (error) throw error;
  // Best-effort: bootstrap falls back to auth metadata, keep it in sync.
  await supabase.auth.updateUser({ data: { display_name: name } });
}

/** All members of a household, oldest first. Throws on failure (callers keep the cache). */
export async function getMembers(householdId: string): Promise<HouseholdMember[]> {
  const { data, error } = await supabase
    .from('household_members')
    .select('user_id, display_name, role')
    .eq('household_id', householdId)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((m) => ({
    userId: m.user_id,
    displayName: m.display_name ?? '',
    role: m.role,
  }));
}

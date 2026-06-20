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

/** The current user's household, or null if they have none yet. */
export async function getMyHousehold(): Promise<MyHousehold | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id, display_name')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!membership) return null;

  const { data: household } = await supabase
    .from('households')
    .select('invite_code')
    .eq('id', membership.household_id)
    .maybeSingle();

  return {
    householdId: membership.household_id,
    displayName: membership.display_name ?? '',
    inviteCode: household?.invite_code ?? '',
  };
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
  return { householdId: householdId as string };
}

/** All members of a household, oldest first. */
export async function getMembers(householdId: string): Promise<HouseholdMember[]> {
  const { data, error } = await supabase
    .from('household_members')
    .select('user_id, display_name, role')
    .eq('household_id', householdId)
    .order('joined_at', { ascending: true });
  if (error || !data) return [];
  return data.map((m) => ({
    userId: m.user_id,
    displayName: m.display_name ?? '',
    role: m.role,
  }));
}

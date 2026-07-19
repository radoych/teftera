// Shared response + auth helpers for the Supabase Edge Functions.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are runtime-injected.
import { createClient } from 'npm:@supabase/supabase-js@2';

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Service-role client (bypasses RLS — used only inside these functions). */
export function adminClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

// NOTE: assumes the one-household-per-user model — with multiple memberships
// this picks the earliest joined. Revisit if multi-household ever ships.
/** Resolve the calling user's household from their Supabase JWT, or null. */
export async function getCallerHousehold(
  req: Request,
): Promise<{ userId: string; householdId: string } | null> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!token) return null;
  const admin = adminClient();
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) return null;
  const { data: member } = await admin
    .from('household_members')
    .select('household_id')
    .eq('user_id', userData.user.id)
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!member) return null;
  return { userId: userData.user.id, householdId: member.household_id as string };
}

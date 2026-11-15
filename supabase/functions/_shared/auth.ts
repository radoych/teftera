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

function bearerToken(req: Request): string {
  return req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
}

/**
 * The `sub` of an *already verified* user JWT, or null.
 *
 * This does NOT check the signature. It is only sound behind the gateway's
 * `verify_jwt = true`, which rejects bad signatures and expired tokens before the
 * function runs. Only tokens minted for a signed-in user (`role: authenticated`)
 * count — the anon key is also a valid JWT but has no user behind it.
 */
export function verifiedUserIdFromJwt(token: string): string | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const claims: unknown = JSON.parse(atob(padded));
    if (typeof claims !== 'object' || claims === null) return null;
    const { sub, role } = claims as { sub?: unknown; role?: unknown };
    if (role !== 'authenticated' || typeof sub !== 'string' || sub.length === 0) return null;
    return sub;
  } catch {
    return null;
  }
}

// NOTE: assumes the one-household-per-user model — with multiple memberships
// this picks the earliest joined. Revisit if multi-household ever ships.
async function householdOf(userId: string): Promise<string | null> {
  const { data: member } = await adminClient()
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return member ? (member.household_id as string) : null;
}

/**
 * Resolve the calling user's household from their Supabase JWT, or null.
 *
 * ONLY for functions deployed with `verify_jwt = true` (gemini-extract,
 * gemini-summary, bank-sync-start, bank-sync-transactions — pinned in
 * supabase/config.toml): the gateway has validated the token, so the `sub` claim
 * is read locally — one DB query, no GoTrue round-trip. A function deployed with
 * `verify_jwt = false` must use `getCallerHouseholdViaGoTrue` instead.
 */
export async function getCallerHousehold(
  req: Request,
): Promise<{ userId: string; householdId: string } | null> {
  const userId = verifiedUserIdFromJwt(bearerToken(req));
  if (!userId) return null;
  const householdId = await householdOf(userId);
  return householdId ? { userId, householdId } : null;
}

/**
 * Same result as `getCallerHousehold`, but validates the token with GoTrue
 * (`auth.getUser`) first. Use this from any function deployed with
 * `verify_jwt = false` (none call it today — bank-sync-callback authenticates
 * via its HMAC-signed `state`).
 */
export async function getCallerHouseholdViaGoTrue(
  req: Request,
): Promise<{ userId: string; householdId: string } | null> {
  const token = bearerToken(req);
  if (!token) return null;
  const { data: userData, error: userErr } = await adminClient().auth.getUser(token);
  if (userErr || !userData.user) return null;
  const householdId = await householdOf(userData.user.id);
  return householdId ? { userId: userData.user.id, householdId } : null;
}

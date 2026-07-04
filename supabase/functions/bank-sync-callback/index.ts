// GET ?code&state — Enable Banking redirects the user's browser here after
// bank consent. No Supabase JWT (verify_jwt=false); trust comes from the
// HMAC-signed `state` minted by bank-sync-start.
import { adminClient, ebFetch, verifyState } from '../_shared/eb.ts';

/** Tiny page that jumps back into the app; visible link as fallback. */
function deepLinkPage(target: string): Response {
  const safe = target.replace(/"/g, '&quot;');
  const html = `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<body style="background:#121316;color:#e3e2e6;font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center">
<p>Връщане към Teftera…</p>
<a href="${safe}" style="color:#adc7ff">Отвори Teftera</a>
</div>
<script>location.href = "${safe}";</script>
</body>`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

const FALLBACK_RETURN = 'teftera://bank-sync';

Deno.serve(async (req) => {
  const params = new URL(req.url).searchParams;
  const code = params.get('code');

  let state;
  try {
    state = await verifyState(params.get('state') ?? '');
  } catch (err) {
    console.error('[bank-sync-callback] state verification error', err);
  }

  const back = (status: string, reason?: string) => {
    const base = state?.r ?? FALLBACK_RETURN;
    const sep = base.includes('?') ? '&' : '?';
    return deepLinkPage(`${base}${sep}status=${status}${reason ? `&reason=${reason}` : ''}`);
  };

  if (!state) return back('error', 'bad_state');
  if (!code) return back('error', params.get('error') ?? 'denied');

  // Exchange the authorization code for an EB session.
  const res = await ebFetch('/sessions', { method: 'POST', body: JSON.stringify({ code }) });
  if (!res.ok) {
    console.error('[bank-sync-callback] EB /sessions failed', res.status, await res.text());
    return back('error', 'session_failed');
  }

  let sessionId: string, accountUid: string, validUntil: string, bankName: string;
  try {
    const data = await res.json();
    sessionId = data.session_id;
    accountUid = data.accounts[0].uid ?? data.accounts[0].id;
    validUntil = data.access.valid_until;
    bankName = data.aspsp?.name ?? 'DSK Bank';
    if (!sessionId || !accountUid || !validUntil) throw new Error('missing fields');
  } catch (err) {
    console.error('[bank-sync-callback] malformed EB session payload', err);
    return back('error', 'session_failed');
  }

  const { error } = await adminClient().from('bank_connections').upsert(
    {
      household_id: state.h,
      created_by: state.u,
      provider: 'enable_banking',
      session_id: sessionId,
      account_uid: accountUid,
      bank_name: bankName,
      valid_until: validUntil,
    },
    { onConflict: 'household_id' },
  );
  if (error) {
    console.error('[bank-sync-callback] upsert failed', error);
    return back('error', 'store_failed');
  }
  return back('ok');
});

// POST { returnUrl } → { url } — begins the Enable Banking consent flow.
import { ebFetch, getCallerHousehold, json, signState } from '../_shared/eb.ts';

const STATE_TTL_SECONDS = 600; // consent must start within 10 minutes
const CONSENT_DAYS = 90;
const APP_SCHEME_RE = /^(teftera|exp(\+[\w.-]+)?):\/\//i;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const redirectUrl = Deno.env.get('EB_REDIRECT_URL');
  if (!redirectUrl) {
    console.error('[bank-sync-start] EB_REDIRECT_URL is not set');
    return json(500, { error: 'misconfigured' });
  }

  const caller = await getCallerHousehold(req);
  if (!caller) return json(401, { error: 'unauthorized' });

  // The app tells us where to deep-link back to (dev client vs Expo Go URLs
  // differ). Only known app schemes are accepted (teftera:// in builds, exp:// / exp+…:// in Expo dev) —
  // never http(s) or anything else; the callback deep-links the browser to this value.
  let returnUrl = 'teftera://bank-sync';
  try {
    const body = await req.json();
    if (typeof body?.returnUrl === 'string' && APP_SCHEME_RE.test(body.returnUrl)) {
      returnUrl = body.returnUrl;
    }
  } catch {
    // no body — keep default
  }

  const state = await signState({
    h: caller.householdId,
    u: caller.userId,
    r: returnUrl,
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
  });

  const validUntil = new Date(Date.now() + CONSENT_DAYS * 24 * 3600 * 1000).toISOString();
  const res = await ebFetch('/auth', {
    method: 'POST',
    body: JSON.stringify({
      access: { valid_until: validUntil },
      aspsp: {
        name: Deno.env.get('EB_ASPSP_NAME') ?? 'Mock ASPSP',
        country: Deno.env.get('EB_ASPSP_COUNTRY') ?? 'FI',
      },
      state,
      redirect_url: redirectUrl,
      psu_type: 'personal',
    }),
  });

  if (!res.ok) {
    console.error('[bank-sync-start] EB /auth failed', res.status, await res.text());
    return json(502, { error: 'eb_error' });
  }
  let data;
  try {
    data = await res.json();
  } catch {
    console.error('[bank-sync-start] EB /auth non-JSON response');
    return json(502, { error: 'eb_error' });
  }
  if (typeof data?.url !== 'string') {
    console.error('[bank-sync-start] EB /auth malformed response');
    return json(502, { error: 'eb_error' });
  }
  return json(200, { url: data.url });
});

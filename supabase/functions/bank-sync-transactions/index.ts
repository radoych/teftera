// POST → { transactions, validUntil } — pulls the last 90 days from EB using
// the household's stored session. Raw EB shapes pass through; all ETL is
// client-side (same pipeline as the CSV import).
import { adminClient, ebFetch, getCallerHousehold, json } from '../_shared/eb.ts';

const LOOKBACK_DAYS = 90;
const MAX_PAGES = 20;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const caller = await getCallerHousehold(req);
  if (!caller) return json(401, { error: 'unauthorized' });

  const { data: conn, error: connErr } = await adminClient()
    .from('bank_connections')
    .select('account_uid, valid_until')
    .eq('household_id', caller.householdId)
    .maybeSingle();
  if (connErr) {
    console.error('[bank-sync-transactions] connection lookup failed', connErr);
    return json(502, { error: 'eb_error' });
  }
  if (!conn) return json(409, { error: 'not_connected' });
  if (new Date(conn.valid_until as string).getTime() < Date.now()) {
    return json(409, { error: 'consent_expired' });
  }

  const dateFrom = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  const transactions: unknown[] = [];
  let continuationKey: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({ date_from: dateFrom });
    if (continuationKey) qs.set('continuation_key', continuationKey);
    const res = await ebFetch(`/accounts/${encodeURIComponent(conn.account_uid)}/transactions?${qs}`);

    if (res.status === 401 || res.status === 403) return json(409, { error: 'consent_expired' });
    if (res.status === 429) return json(429, { error: 'rate_limited' });
    if (!res.ok) {
      console.error('[bank-sync-transactions] EB failed', res.status, await res.text());
      return json(502, { error: 'eb_error' });
    }

    let data: { transactions?: unknown[]; continuation_key?: string };
    try {
      data = await res.json();
    } catch {
      return json(502, { error: 'eb_error' });
    }
    transactions.push(...(data.transactions ?? []));
    continuationKey = data.continuation_key;
    if (!continuationKey) break;
  }

  const truncated = Boolean(continuationKey);
  if (truncated) {
    console.warn('[bank-sync-transactions] MAX_PAGES reached with continuation_key still present — result truncated');
  }

  return json(200, { transactions, truncated, validUntil: conn.valid_until });
});

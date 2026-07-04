# Day 17 — DSK Live Bank Sync (Enable Banking) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Синхронизирай с ДСК" button on the import screen that pulls the last 90 days of bank transactions through Enable Banking (PSD2) and feeds them into the existing preview → dedupe → confirm import pipeline.

**Architecture:** Three Supabase Edge Functions (Deno) hold the Enable Banking
credentials and proxy consent + transaction pulls; the client gets raw EB
transaction JSON and reuses the entire existing client-side ETL (normalize →
categorize → dedupe → preview → bulk insert). One new `bank_connections` table
(household-scoped, RLS) stores the EB session. Sandbox-first: everything is
developed against EB's mock bank; production is a secrets swap.

**Tech Stack:** Supabase Edge Functions (Deno, `npm:jose` for RS256 JWT), Supabase Postgres + RLS, React Native / Expo (`expo-web-browser`, `expo-linking`), Jest for pure units.

**Spec:** `docs/superpowers/specs/2026-07-04-day17-bank-live-sync-design.md`

## Global Constraints

- Money = integer euro cents everywhere; BGN legacy converts at fixed **1 EUR = 1.95583 BGN** via the existing `bgnToEurCents`; retain `original_amount` + `original_currency` (spec Decision 7).
- **No secrets in git or the app bundle.** The EB private key, App ID, and state secret exist only as Edge Function secrets (spec, Rule 5).
- `household_id` + RLS on the new table, standard membership pattern (Rule 3).
- Schema change ships as a migration file, applied via the Supabase MCP `apply_migration`; rename the local file to the stamped version (project convention).
- TypeScript strict, no `any`, no plain `.js`.
- UI copy in Bulgarian, matching the existing import screen tone.
- Conventional commits.
- New client dep allowed: `expo-web-browser` (free, first-party). No other new deps.
- One EB connection per household (`unique(household_id)`).
- Plan-level refinement of the spec: EB **credit (CRDT) rows map to `kind: 'income'`** (not `null`) so the existing preview's "Приходи — пропуснати" section works identically to the CSV path; `null` is reserved for unparseable/non-booked rows. This is closer to the spec's own "like the CSV path" intent.

---

### Task 1: `bank_connections` migration

**Files:**
- Create: `supabase/migrations/<stamped>_bank_connections.sql` (stamp assigned by MCP; see Step 3)

**Interfaces:**
- Produces: table `public.bank_connections` with columns `id, household_id, created_by, provider, session_id, account_uid, bank_name, valid_until, created_at`; `authenticated` can SELECT only the non-secret columns; service role has full access. Tasks 5, 6, 8 rely on these exact column names.

- [ ] **Step 1: Write the migration SQL**

Content (the MCP call in Step 2 takes this as `query`; the local file gets the same content):

```sql
-- Day 17: Enable Banking connection per household (one row max).
create table public.bank_connections (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  created_by    uuid not null references auth.users (id),
  provider      text not null default 'enable_banking',
  session_id    text not null,
  account_uid   text not null,
  bank_name     text not null default 'DSK Bank',
  valid_until   timestamptz not null,
  created_at    timestamptz not null default now(),
  unique (household_id)
);

alter table public.bank_connections enable row level security;

-- Household members may see their connection's metadata and disconnect it.
-- INSERT/UPDATE happen only in the Edge Function callback via service role,
-- so no INSERT/UPDATE policies for authenticated.
create policy "bank_connections_select_own_household"
  on public.bank_connections for select to authenticated
  using (household_id in (select private.member_household_ids()));

create policy "bank_connections_delete_own_household"
  on public.bank_connections for delete to authenticated
  using (household_id in (select private.member_household_ids()));

-- session_id grants bank-data access: hide it from client roles via
-- column-level grants. (RLS restricts rows; grants restrict columns.)
revoke all on public.bank_connections from anon, authenticated;
grant select (id, household_id, bank_name, valid_until, created_at)
  on public.bank_connections to authenticated;
grant delete on public.bank_connections to authenticated;
```

> **Note:** the RLS helper lives in the `private` schema (project convention —
> see memory "schema-hardening-decisions"). Before applying, confirm the
> helper's exact name with: `select proname from pg_proc join pg_namespace n on n.oid = pronamespace where n.nspname = 'private';`
> (expected: a function returning the caller's household ids, used by every
> existing policy — copy the call syntax from an existing policy via
> `select polname, pg_get_expr(polqual, polrelid) from pg_policy limit 5;`).
> If existing policies use the inline `household_id in (select household_id from household_members where user_id = auth.uid())` pattern instead, use that exact pattern here too.

- [ ] **Step 2: Apply via Supabase MCP**

Call MCP tool `mcp__supabase__apply_migration` with `name: "bank_connections"` and the SQL above as `query`. Expected: success, version stamp returned (e.g. `20260704...`).

- [ ] **Step 3: Save the local migration file with the stamped version**

Write the same SQL to `supabase/migrations/<stamp>_bank_connections.sql` where `<stamp>` is the version from Step 2 (project convention so `list_migrations` and the repo agree).

- [ ] **Step 4: Verify table, RLS, and column privacy**

Call MCP `mcp__supabase__execute_sql` with:

```sql
select
  (select relrowsecurity from pg_class where relname = 'bank_connections') as rls_on,
  (select count(*) from pg_policy where polrelid = 'public.bank_connections'::regclass) as policies,
  has_column_privilege('authenticated', 'public.bank_connections', 'session_id', 'select') as session_id_readable,
  has_column_privilege('authenticated', 'public.bank_connections', 'bank_name', 'select') as bank_name_readable;
```

Expected: `rls_on = true`, `policies = 2`, `session_id_readable = false`, `bank_name_readable = true`.

- [ ] **Step 5: Check advisors**

Call MCP `mcp__supabase__get_advisors` (security). Expected: no **new** findings versus the known intentional exceptions (memory "schema-hardening-decisions").

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/*_bank_connections.sql
git commit -m "feat(bank-sync): bank_connections table with RLS + column-level session_id privacy"
```

---

### Task 2: EB transaction normalizer (pure, TDD)

**Files:**
- Create: `services/bank-sync.ts` (normalizer + types only in this task; client fetchers arrive in Task 8)
- Test: `services/bank-sync.test.ts`

**Interfaces:**
- Consumes: `NormalizedTransaction`, `normalizeMerchant`, `cleanMerchant`, `occurredAtISO` from `@/services/dsk-import`; `bgnToEurCents` from `@/lib/formatCurrency`; `guessCategory` from `@/lib/categories`.
- Produces: `interface EbTransaction` and `function normalizeEbTransaction(tx: EbTransaction): NormalizedTransaction | null`. Task 9 consumes both.

- [ ] **Step 1: Write the failing tests**

`services/bank-sync.test.ts`:

```ts
import { normalizeEbTransaction, type EbTransaction } from './bank-sync';

const base: EbTransaction = {
  transaction_amount: { amount: '12.34', currency: 'EUR' },
  credit_debit_indicator: 'DBIT',
  status: 'BOOK',
  booking_date: '2026-07-01',
  value_date: '2026-07-02',
  creditor: { name: 'LIDL SOFIA' },
  remittance_information: ['POS purchase LIDL'],
};

describe('normalizeEbTransaction', () => {
  it('maps a booked EUR debit to an expense in integer cents', () => {
    const r = normalizeEbTransaction(base);
    expect(r).toEqual({
      kind: 'expense',
      amountEurCents: 1234,
      originalAmountCents: null,
      originalCurrency: null,
      merchant: 'Lidl', // BRAND_RULES via normalizeMerchant
      categoryGuess: expect.any(String),
      date: '2026-07-01',
      occurredAt: expect.stringMatching(/T/),
    });
  });

  it('maps CRDT rows to income (preview skips them, like CSV)', () => {
    const r = normalizeEbTransaction({ ...base, credit_debit_indicator: 'CRDT' });
    expect(r?.kind).toBe('income');
  });

  it('converts BGN legacy rows at the fixed rate and retains originals', () => {
    const r = normalizeEbTransaction({
      ...base,
      transaction_amount: { amount: '19.56', currency: 'BGN' },
    });
    expect(r?.amountEurCents).toBe(1000); // 1956 / 1.95583 rounded
    expect(r?.originalAmountCents).toBe(1956);
    expect(r?.originalCurrency).toBe('BGN');
  });

  it('falls back to remittance information when creditor name is missing', () => {
    const r = normalizeEbTransaction({ ...base, creditor: null });
    expect(r?.merchant).toBe('Lidl'); // brand rule still matches the remittance text
  });

  it('uses value_date when booking_date is missing', () => {
    const r = normalizeEbTransaction({ ...base, booking_date: null });
    expect(r?.date).toBe('2026-07-02');
  });

  it('returns null for non-booked, unparseable-amount, unknown-currency, and dateless rows', () => {
    expect(normalizeEbTransaction({ ...base, status: 'PDNG' })).toBeNull();
    expect(
      normalizeEbTransaction({ ...base, transaction_amount: { amount: 'x', currency: 'EUR' } }),
    ).toBeNull();
    expect(
      normalizeEbTransaction({ ...base, transaction_amount: { amount: '5.00', currency: 'USD' } }),
    ).toBeNull();
    expect(normalizeEbTransaction({ ...base, booking_date: null, value_date: null })).toBeNull();
  });

  it('takes absolute value of negative amounts', () => {
    const r = normalizeEbTransaction({
      ...base,
      transaction_amount: { amount: '-7.50', currency: 'EUR' },
    });
    expect(r?.amountEurCents).toBe(750);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest services/bank-sync.test.ts`
Expected: FAIL — `Cannot find module './bank-sync'`.

- [ ] **Step 3: Implement the normalizer**

`services/bank-sync.ts`:

```ts
/**
 * Enable Banking live sync — client seam.
 *
 * This module is the ONLY place the app talks to the bank-sync Edge Functions
 * (which in turn are the only place Enable Banking is called — the EB private
 * key never reaches the client). The normalizer below converts EB's PSD2
 * transaction shape into the same NormalizedTransaction the DSK CSV path
 * produces, so preview/dedupe/import are shared unchanged.
 */
import { guessCategory } from '@/lib/categories';
import { bgnToEurCents } from '@/lib/formatCurrency';
import {
  normalizeMerchant,
  occurredAtISO,
  type NormalizedTransaction,
} from '@/services/dsk-import';

/** The subset of Enable Banking's transaction resource we consume. */
export interface EbTransaction {
  transaction_amount: { amount: string; currency: string };
  credit_debit_indicator: string; // 'DBIT' | 'CRDT'
  status?: string | null; // 'BOOK' | 'PDNG' | ...
  booking_date?: string | null; // YYYY-MM-DD
  value_date?: string | null; // YYYY-MM-DD
  creditor?: { name?: string | null } | null;
  remittance_information?: string[] | null;
}

/**
 * Map one EB transaction to the CSV pipeline's shape. Returns null for rows
 * the import cannot represent (pending, unparseable amount, unsupported
 * currency, no date) — callers count and drop them.
 */
export function normalizeEbTransaction(tx: EbTransaction): NormalizedTransaction | null {
  if (tx.status && tx.status !== 'BOOK') return null;

  const value = Number(tx.transaction_amount?.amount);
  if (!Number.isFinite(value)) return null;
  const rawCents = Math.round(Math.abs(value) * 100);

  const currency = tx.transaction_amount.currency;
  if (currency !== 'EUR' && currency !== 'BGN') return null;

  const date = tx.booking_date || tx.value_date || null;
  if (!date) return null;

  const rawMerchant =
    tx.creditor?.name?.trim() || (tx.remittance_information ?? []).join(' ').trim();
  const merchant = normalizeMerchant(rawMerchant);

  const base = {
    kind: (tx.credit_debit_indicator === 'CRDT' ? 'income' : 'expense') as 'income' | 'expense',
    merchant,
    categoryGuess: guessCategory(merchant),
    date,
    occurredAt: occurredAtISO(date, ''),
  };

  if (currency === 'BGN') {
    return {
      ...base,
      amountEurCents: bgnToEurCents(rawCents),
      originalAmountCents: rawCents,
      originalCurrency: 'BGN',
    };
  }
  return { ...base, amountEurCents: rawCents, originalAmountCents: null, originalCurrency: null };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest services/bank-sync.test.ts`
Expected: PASS (7 tests). If the BGN expectation is off by a cent, check `bgnToEurCents(1956)` — the test value was chosen to divide cleanly (1956 / 1.95583 = 1000.08… → verify against the helper's actual rounding and, if it returns 1000, keep; if 1001, update the test literal to the helper's output — the helper is the source of truth).

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit` — expected: clean.

```bash
git add services/bank-sync.ts services/bank-sync.test.ts
git commit -m "feat(bank-sync): EB transaction normalizer reusing the CSV ETL shape"
```

---

### Task 3: Edge shared helpers (`_shared/eb.ts`) + function config

**Files:**
- Create: `supabase/functions/_shared/eb.ts`
- Modify: `supabase/config.toml` (append function config)

**Interfaces:**
- Consumes: Edge secrets `EB_APP_ID`, `EB_PRIVATE_KEY`, `EB_STATE_SECRET` (set in Task 7).
- Produces (Deno, consumed by Tasks 4–6):
  - `ebFetch(path: string, init?: RequestInit): Promise<Response>` — EB call with a fresh RS256 JWT.
  - `signState(p: StatePayload): Promise<string>` / `verifyState(s: string): Promise<StatePayload | null>` where `interface StatePayload { h: string; u: string; r: string; exp: number }` (household id, user id, return deep link, unix expiry).
  - `getCallerHousehold(req: Request): Promise<{ userId: string; householdId: string } | null>`
  - `json(status: number, body: unknown): Response`

- [ ] **Step 1: Write the shared helper**

`supabase/functions/_shared/eb.ts`:

```ts
// Shared Enable Banking + auth helpers for the bank-sync Edge Functions.
// Secrets (EB_APP_ID, EB_PRIVATE_KEY, EB_STATE_SECRET) exist only here,
// server-side. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are runtime-injected.
import * as jose from 'npm:jose@5';
import { createClient } from 'npm:@supabase/supabase-js@2';

const EB_API = 'https://api.enablebanking.com';
const enc = new TextEncoder();

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Mint a short-lived EB API JWT (RS256, kid = application id). */
async function mintEbJwt(): Promise<string> {
  const key = await jose.importPKCS8(Deno.env.get('EB_PRIVATE_KEY')!, 'RS256');
  return await new jose.SignJWT({})
    .setProtectedHeader({ typ: 'JWT', alg: 'RS256', kid: Deno.env.get('EB_APP_ID')! })
    .setIssuer('enablebanking.com')
    .setAudience('api.enablebanking.com')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
}

export async function ebFetch(path: string, init?: RequestInit): Promise<Response> {
  const jwt = await mintEbJwt();
  return await fetch(`${EB_API}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
  });
}

/** OAuth `state`: HMAC-signed so the (unauthenticated) callback can trust it. */
export interface StatePayload {
  h: string; // household_id
  u: string; // user_id
  r: string; // return deep link into the app
  exp: number; // unix seconds
}

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmacKey(usage: KeyUsage): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    enc.encode(Deno.env.get('EB_STATE_SECRET')!),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );
}

export async function signState(p: StatePayload): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(p)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey('sign'), enc.encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

export async function verifyState(state: string): Promise<StatePayload | null> {
  const [body, sig] = state.split('.');
  if (!body || !sig) return null;
  const sigBytes = Uint8Array.from(
    atob(sig.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0),
  );
  const ok = await crypto.subtle.verify('HMAC', await hmacKey('verify'), sigBytes, enc.encode(body));
  if (!ok) return null;
  try {
    const payload = JSON.parse(
      atob(body.replace(/-/g, '+').replace(/_/g, '/')),
    ) as StatePayload;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Service-role client (bypasses RLS — used only inside these functions). */
export function adminClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

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
    .limit(1)
    .maybeSingle();
  if (!member) return null;
  return { userId: userData.user.id, householdId: member.household_id as string };
}
```

- [ ] **Step 2: Add function config to `supabase/config.toml`**

Append at the end of the file:

```toml
[functions.bank-sync-start]
verify_jwt = true

# The callback is hit by the bank's browser redirect — no Supabase JWT.
# It authenticates via the HMAC-signed `state` instead.
[functions.bank-sync-callback]
verify_jwt = false

[functions.bank-sync-transactions]
verify_jwt = true
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/eb.ts supabase/config.toml
git commit -m "feat(bank-sync): shared EB JWT/state/auth helpers for edge functions"
```

> Deno files are not seen by `tsc --noEmit` (they're outside the RN project's
> include set — verify: `npx tsc --noEmit` must stay clean; if it now tries to
> compile `supabase/functions/**`, add that glob to `exclude` in `tsconfig.json`
> in this same commit). Correctness is verified by the Task 7 smoke test.

---

### Task 4: `bank-sync-start` function

**Files:**
- Create: `supabase/functions/bank-sync-start/index.ts`

**Interfaces:**
- Consumes: `ebFetch`, `signState`, `getCallerHousehold`, `json` from `../_shared/eb.ts`; secrets `EB_REDIRECT_URL`, `EB_ASPSP_NAME`, `EB_ASPSP_COUNTRY`.
- Produces: `POST /functions/v1/bank-sync-start` with JSON body `{ returnUrl: string }` → `200 { url: string }` (bank consent URL) | `401 { error: 'unauthorized' }` | `502 { error: 'eb_error' }`. Task 8's `startBankSync()` calls this.

- [ ] **Step 1: Write the function**

`supabase/functions/bank-sync-start/index.ts`:

```ts
// POST { returnUrl } → { url } — begins the Enable Banking consent flow.
import { ebFetch, getCallerHousehold, json, signState } from '../_shared/eb.ts';

const STATE_TTL_SECONDS = 600; // consent must start within 10 minutes
const CONSENT_DAYS = 90;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const caller = await getCallerHousehold(req);
  if (!caller) return json(401, { error: 'unauthorized' });

  // The app tells us where to deep-link back to (dev client vs Expo Go URLs
  // differ). Only app schemes are accepted — never http(s).
  let returnUrl = 'teftera://bank-sync';
  try {
    const body = await req.json();
    if (typeof body?.returnUrl === 'string' && /^[a-z][a-z0-9+.-]*:\/\//i.test(body.returnUrl)
        && !/^https?:/i.test(body.returnUrl)) {
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
      redirect_url: Deno.env.get('EB_REDIRECT_URL')!,
      psu_type: 'personal',
    }),
  });

  if (!res.ok) {
    console.error('[bank-sync-start] EB /auth failed', res.status, await res.text());
    return json(502, { error: 'eb_error' });
  }
  const data = await res.json();
  if (typeof data?.url !== 'string') {
    console.error('[bank-sync-start] EB /auth malformed response');
    return json(502, { error: 'eb_error' });
  }
  return json(200, { url: data.url });
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/bank-sync-start/index.ts
git commit -m "feat(bank-sync): consent-start edge function"
```

(Behavior is exercised in the Task 7 smoke test — Deno functions have no local jest harness.)

---

### Task 5: `bank-sync-callback` function

**Files:**
- Create: `supabase/functions/bank-sync-callback/index.ts`

**Interfaces:**
- Consumes: `ebFetch`, `verifyState`, `adminClient` from `../_shared/eb.ts`; table `bank_connections` (Task 1).
- Produces: `GET /functions/v1/bank-sync-callback?code=…&state=…` → HTML page that immediately deep-links to `state.r` with `?status=ok` or `?status=error&reason=…`. Upserts the household's `bank_connections` row on success. The EB console redirect URL registered during provisioning points here.

- [ ] **Step 1: Write the function**

`supabase/functions/bank-sync-callback/index.ts`:

```ts
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
  const state = await verifyState(params.get('state') ?? '');

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
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/bank-sync-callback/index.ts
git commit -m "feat(bank-sync): consent callback edge function (session exchange + upsert)"
```

---

### Task 6: `bank-sync-transactions` function

**Files:**
- Create: `supabase/functions/bank-sync-transactions/index.ts`

**Interfaces:**
- Consumes: `ebFetch`, `getCallerHousehold`, `adminClient`, `json` from `../_shared/eb.ts`; table `bank_connections`.
- Produces: `POST /functions/v1/bank-sync-transactions` (empty body) → `200 { transactions: EbTransaction[], validUntil: string }` | `401 { error: 'unauthorized' }` | `409 { error: 'not_connected' }` | `409 { error: 'consent_expired' }` | `429 { error: 'rate_limited' }` | `502 { error: 'eb_error' }`. Task 8's `fetchBankTransactions()` consumes these exact codes.

- [ ] **Step 1: Write the function**

`supabase/functions/bank-sync-transactions/index.ts`:

```ts
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

  const { data: conn } = await adminClient()
    .from('bank_connections')
    .select('session_id, account_uid, valid_until')
    .eq('household_id', caller.householdId)
    .maybeSingle();
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
    const res = await ebFetch(`/accounts/${conn.account_uid}/transactions?${qs}`);

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

  return json(200, { transactions, validUntil: conn.valid_until });
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/bank-sync-transactions/index.ts
git commit -m "feat(bank-sync): transaction-pull edge function (90-day paginated)"
```

---

### Task 7: Deploy, secrets, sandbox smoke test

**Files:** none (operational task; owner supplies secret values)

**Interfaces:**
- Consumes: the three functions (Tasks 4–6), sandbox App ID + `.pem` (provisioned; owner holds them outside the repo).
- Produces: live endpoints at `https://kabevzkjocnrceqsdavw.supabase.co/functions/v1/bank-sync-*`, verified end-to-end against EB's mock bank.

> **Owner-interactive task**: secret values and the mock-bank consent click-through come from the user. Never echo the private key into shell history from the plan — point the command at the file path.

- [ ] **Step 1: Set the Edge Function secrets (sandbox values)**

Ask the owner for the sandbox `.pem` path and sandbox Application ID, then:

```bash
npx supabase secrets set --project-ref kabevzkjocnrceqsdavw \
  EB_APP_ID="<sandbox-app-id>" \
  EB_REDIRECT_URL="https://kabevzkjocnrceqsdavw.supabase.co/functions/v1/bank-sync-callback" \
  EB_ASPSP_NAME="Mock ASPSP" \
  EB_ASPSP_COUNTRY="FI" \
  EB_STATE_SECRET="$(openssl rand -hex 32)"
npx supabase secrets set --project-ref kabevzkjocnrceqsdavw \
  EB_PRIVATE_KEY="$(cat '<path-to-sandbox-pem>')"
```

Expected: `Finished supabase secrets set`. Verify names (values are never shown): `npx supabase secrets list --project-ref kabevzkjocnrceqsdavw` shows the 6 EB_* keys.

- [ ] **Step 2: Deploy the three functions**

```bash
npx supabase functions deploy bank-sync-start --project-ref kabevzkjocnrceqsdavw
npx supabase functions deploy bank-sync-callback --project-ref kabevzkjocnrceqsdavw
npx supabase functions deploy bank-sync-transactions --project-ref kabevzkjocnrceqsdavw
```

Expected: each reports `Deployed Function`. `bank-sync-callback` must show `verify_jwt = false` picked up from config.toml (deploy output lists it; if not, redeploy with `--no-verify-jwt`).

- [ ] **Step 3: Smoke — unauthorized call is rejected**

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://kabevzkjocnrceqsdavw.supabase.co/functions/v1/bank-sync-transactions \
  -H "Authorization: Bearer invalid" \
  -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY"
```

Expected: `401`.

- [ ] **Step 4: Smoke — full consent + pull with the mock bank**

1. Obtain a real user access token: sign in as the owner's account via a one-off node script against the anon client, printing `session.access_token` (env vars from `.env`):

```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const c = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
c.auth.signInWithPassword({ email: process.argv[1], password: process.argv[2] })
  .then(({ data, error }) => console.log(error ?? data.session.access_token));
" "<owner-email>" "<password-from-owner>"
```

2. Start consent:

```bash
curl -s -X POST https://kabevzkjocnrceqsdavw.supabase.co/functions/v1/bank-sync-start \
  -H "Authorization: Bearer <token>" -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" -d '{"returnUrl":"teftera://bank-sync"}'
```

Expected: `{"url":"https://…"}`.

3. **Owner action:** open the URL in a browser, complete the mock-bank consent. The browser lands on the callback's "Връщане към Teftera…" page (the `teftera://` link won't resolve on desktop — that's fine).

4. Verify the connection row (MCP `execute_sql`): `select bank_name, valid_until from bank_connections;` → one row, mock bank, future date.

5. Pull transactions:

```bash
curl -s -X POST https://kabevzkjocnrceqsdavw.supabase.co/functions/v1/bank-sync-transactions \
  -H "Authorization: Bearer <token>" -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" | head -c 800
```

Expected: `{"transactions":[{…"transaction_amount":…}…],"validUntil":"…"}` with mock rows.

6. Save the response body to `services/__fixtures__/eb-sandbox-transactions.json` (trim to ~5 representative rows) — becomes normalizer fixture data.

- [ ] **Step 5: Commit the fixture**

```bash
git add services/__fixtures__/eb-sandbox-transactions.json
git commit -m "test(bank-sync): recorded EB sandbox transaction fixtures"
```

---

### Task 8: Client seam — typed fetchers

**Files:**
- Modify: `services/bank-sync.ts` (append below the normalizer)
- Test: `services/bank-sync.test.ts` (append)

**Interfaces:**
- Consumes: `supabase` from `@/services/supabase`; Edge endpoints from Tasks 4/6.
- Produces (Task 9 consumes):
  - `class NotConnectedError extends Error {}`
  - `class ConsentExpiredError extends Error {}`
  - `class RateLimitedError extends Error {}`
  - `startBankSync(returnUrl: string): Promise<string>` — consent URL.
  - `fetchBankTransactions(): Promise<EbTransaction[]>` — throws the typed errors above.
  - `getBankConnection(householdId: string): Promise<{ bankName: string; validUntil: string } | null>`

- [ ] **Step 1: Write failing tests for the error mapping**

Append to `services/bank-sync.test.ts` (mock `fetch` + the supabase session):

```ts
import {
  ConsentExpiredError,
  NotConnectedError,
  RateLimitedError,
  fetchBankTransactions,
} from './bank-sync';
import { supabase } from '@/services/supabase';

jest.mock('@/services/supabase', () => ({
  supabase: { auth: { getSession: jest.fn() }, from: jest.fn() },
}));

describe('fetchBankTransactions error mapping', () => {
  const mockSession = () =>
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { access_token: 'tok' } },
    });

  const mockFetch = (status: number, body: unknown) => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: status < 400,
      status,
      json: async () => body,
    }) as unknown as typeof fetch;
  };

  beforeEach(() => mockSession());

  it('maps 409 not_connected', async () => {
    mockFetch(409, { error: 'not_connected' });
    await expect(fetchBankTransactions()).rejects.toBeInstanceOf(NotConnectedError);
  });

  it('maps 409 consent_expired', async () => {
    mockFetch(409, { error: 'consent_expired' });
    await expect(fetchBankTransactions()).rejects.toBeInstanceOf(ConsentExpiredError);
  });

  it('maps 429 to RateLimitedError', async () => {
    mockFetch(429, { error: 'rate_limited' });
    await expect(fetchBankTransactions()).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('returns the transactions array on 200', async () => {
    mockFetch(200, { transactions: [{ x: 1 }], validUntil: '2026-10-01T00:00:00Z' });
    await expect(fetchBankTransactions()).resolves.toEqual([{ x: 1 }]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest services/bank-sync.test.ts`
Expected: FAIL — `fetchBankTransactions` is not exported.

- [ ] **Step 3: Implement the fetchers**

Append to `services/bank-sync.ts`:

```ts
import { supabase } from '@/services/supabase';

const FUNCTIONS_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''}/functions/v1`;

export class NotConnectedError extends Error {}
export class ConsentExpiredError extends Error {}
export class RateLimitedError extends Error {}

async function callBankSyncFn(name: string, body?: unknown): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('not signed in');
  return await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Begin the consent flow; returns the bank authorization URL to open. */
export async function startBankSync(returnUrl: string): Promise<string> {
  const res = await callBankSyncFn('bank-sync-start', { returnUrl });
  if (!res.ok) throw new Error(`bank-sync-start failed (${res.status})`);
  const data = (await res.json()) as { url?: string };
  if (typeof data.url !== 'string') throw new Error('bank-sync-start: malformed response');
  return data.url;
}

/** Pull the last 90 days of raw EB transactions for this household. */
export async function fetchBankTransactions(): Promise<EbTransaction[]> {
  const res = await callBankSyncFn('bank-sync-transactions');
  if (res.status === 409) {
    const { error } = (await res.json()) as { error?: string };
    if (error === 'not_connected') throw new NotConnectedError(error);
    throw new ConsentExpiredError(error ?? 'consent_expired');
  }
  if (res.status === 429) throw new RateLimitedError('rate_limited');
  if (!res.ok) throw new Error(`bank-sync-transactions failed (${res.status})`);
  const data = (await res.json()) as { transactions?: EbTransaction[] };
  return data.transactions ?? [];
}

/** The household's connection metadata (secret column is not even readable). */
export async function getBankConnection(
  householdId: string,
): Promise<{ bankName: string; validUntil: string } | null> {
  const { data, error } = await supabase
    .from('bank_connections')
    .select('bank_name, valid_until')
    .eq('household_id', householdId)
    .maybeSingle();
  if (error || !data) return null;
  return { bankName: data.bank_name as string, validUntil: data.valid_until as string };
}
```

> Note for the normalizer tests written in Task 2: they import from the same
> module that now imports `@/services/supabase`; the `jest.mock` above keeps
> them isolated. Run the **whole file**, not a single `-t` filter, to confirm.

- [ ] **Step 4: Run tests + typecheck**

Run: `npx jest services/bank-sync.test.ts` — expected: PASS (11 tests).
Run: `npx tsc --noEmit` — expected: clean.

- [ ] **Step 5: Commit**

```bash
git add services/bank-sync.ts services/bank-sync.test.ts
git commit -m "feat(bank-sync): client seam with typed consent/rate-limit errors"
```

---

### Task 9: Import screen wiring

**Files:**
- Modify: `app/import-dsk.tsx`
- Modify: `package.json` (add `expo-web-browser` via `npx expo install`)

**Interfaces:**
- Consumes: `startBankSync`, `fetchBankTransactions`, `getBankConnection`, `normalizeEbTransaction`, typed errors (Tasks 2/8); `dedupeImport`, `bulkInsertImported`, `resolveCategoryId`, stores — all already imported by the screen.
- Produces: the user-facing flow; no downstream consumers.

- [ ] **Step 1: Install the dependency**

Run: `npx expo install expo-web-browser`
Expected: `package.json` gains `expo-web-browser` at the SDK-56-pinned version.

- [ ] **Step 2: Wire the sync flow**

Edits to `app/import-dsk.tsx`:

**(a) New imports** (top of file):

```ts
import { useEffect } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import {
  ConsentExpiredError,
  NotConnectedError,
  RateLimitedError,
  fetchBankTransactions,
  getBankConnection,
  normalizeEbTransaction,
  startBankSync,
} from '@/services/bank-sync';
```

(merge `useEffect` into the existing `react` import; keep the existing imports untouched.)

**(b) Status union** — extend:

```ts
type Status = 'idle' | 'reading' | 'syncing' | 'ready' | 'importing' | 'done';
```

**(c) Connection state + load** — inside `ImportDskScreen`, after the existing `useState` hooks:

```ts
const [connection, setConnection] = useState<{ bankName: string; validUntil: string } | null>(null);
const [needsReconnect, setNeedsReconnect] = useState(false);
const householdId = useAuthStore((s) => s.householdId);

useEffect(() => {
  if (!householdId) return;
  getBankConnection(householdId).then(setConnection).catch(() => {});
}, [householdId]);
```

**(d) The sync handler** — add next to `pickAndParse`:

```ts
const runConsentFlow = async (): Promise<boolean> => {
  const returnUrl = Linking.createURL('bank-sync'); // teftera://bank-sync (dev client) or exp://…/--/bank-sync (Expo Go)
  const authUrl = await startBankSync(returnUrl);
  const result = await WebBrowser.openAuthSessionAsync(authUrl, returnUrl);
  return result.type === 'success' && result.url.includes('status=ok');
};

const syncFromBank = async () => {
  if (status === 'syncing') return;
  setStatus('syncing');
  try {
    let ebRows;
    try {
      ebRows = await fetchBankTransactions();
    } catch (err) {
      if (err instanceof NotConnectedError || err instanceof ConsentExpiredError) {
        const consented = await runConsentFlow();
        if (!consented) {
          setStatus('idle');
          setNeedsReconnect(err instanceof ConsentExpiredError);
          Alert.alert('Синхронизация', 'Свързването с банката не беше завършено.');
          return;
        }
        setNeedsReconnect(false);
        if (householdId) getBankConnection(householdId).then(setConnection).catch(() => {});
        ebRows = await fetchBankTransactions();
      } else {
        throw err;
      }
    }

    const rows = ebRows
      .map(normalizeEbTransaction)
      .filter((r): r is NonNullable<typeof r> => r !== null);
    const expenses = rows.filter((r) => r.kind === 'expense');
    const income = rows.filter((r) => r.kind === 'income');
    const { toImport, duplicates } = dedupeImport(expenses, transactions);

    setPreview({ toImport, duplicates, income, fileName: 'Синхронизация с ДСК' });
    setStatus('ready');
  } catch (err) {
    if (__DEV__) console.warn('[bank-sync] failed', err);
    setStatus('idle');
    if (err instanceof RateLimitedError) {
      Alert.alert('Синхронизация', 'Лимитът на банката е достигнат — опитайте по-късно.');
    } else if (err instanceof ConsentExpiredError) {
      setNeedsReconnect(true);
      Alert.alert('Синхронизация', 'Достъпът до банката е изтекъл. Свържете се отново.');
    } else {
      Alert.alert('Грешка', 'Синхронизацията не успя. Опитай отново.');
    }
  }
};
```

**(e) Idle / loading branch** — replace the current `if (!preview)` block's body:

```tsx
if (!preview) {
  const busy = status === 'reading' || status === 'syncing';
  return (
    <Screen
      floatingAboveTabBar={
        busy ? undefined : (
          <FloatingActionBar
            actions={[
              {
                label: needsReconnect ? 'Повторно свързване с ДСК' : 'Синхронизирай с ДСК',
                icon: 'sync',
                variant: 'filled',
                onPress: syncFromBank,
              },
              { label: 'Избери CSV файл', icon: 'folder-open', variant: 'ghost', onPress: pickAndParse },
            ]}
          />
        )
      }>
      <Header />
      {busy ? (
        <View className="items-center py-xxl">
          <ActivityIndicator color="#adc7ff" />
          <Text className="mt-md font-inter text-body-md text-on-surface-variant opacity-70">
            {status === 'syncing' ? 'Синхронизиране с банката…' : 'Обработка на файла…'}
          </Text>
        </View>
      ) : (
        <>
          <EmptyState
            icon="account-balance"
            title="Добави транзакции"
            message="Синхронизирай директно с ДСК или импортирай CSV извлечение от онлайн банкирането."
          />
          {connection ? (
            <Text className="text-center font-inter text-label-md text-on-surface-variant opacity-60">
              {`Свързано с ${connection.bankName} · валидно до ${new Date(
                connection.validUntil,
              ).toLocaleDateString('bg-BG')}`}
            </Text>
          ) : null}
        </>
      )}
    </Screen>
  );
}
```

(The EmptyState loses its `cta` — both actions now live in the FloatingActionBar, primary listed first per the action-row rule.)

**(f) Ready-state action bar** — the first (ghost) action currently re-picks a file; make it source-aware so a sync preview can re-sync:

```ts
{
  label: preview.fileName === 'Синхронизация с ДСК' ? 'Синхронизирай пак' : 'Друг файл',
  icon: preview.fileName === 'Синхронизация с ДСК' ? 'sync' : 'folder-open',
  variant: 'ghost',
  onPress: preview.fileName === 'Синхронизация с ДСК' ? syncFromBank : pickAndParse,
},
```

- [ ] **Step 3: Typecheck, lint, full test suite**

Run: `npx tsc --noEmit` — expected: clean.
Run: `npx expo lint` — expected: clean.
Run: `npm test` — expected: all suites pass.

- [ ] **Step 4: Commit**

```bash
git add app/import-dsk.tsx package.json package-lock.json
git commit -m "feat(bank-sync): Sync-with-DSK flow on the import screen"
```

---

### Task 10: End-to-end checkpoint + docs

**Files:**
- Modify: `teftera-build-plan.md` (Day 17 section)

**Interfaces:** none.

- [ ] **Step 1: On-device checkpoint (dev client, sandbox secrets)**

Start the dev server; on the phone: Import screen → **Синхронизирай с ДСК** → mock-bank consent opens in the browser → app resumes → preview lists sandbox transactions with categories → confirm → rows appear in History (EUR cents). Run sync again → same rows appear under **Дубликати**. Then delete the connection row (MCP `execute_sql`: `delete from bank_connections;`) and sync → the consent flow relaunches (reconnect path).

Expected: all four behaviors observed; no crashes.

- [ ] **Step 2: Update the build plan**

In `teftera-build-plan.md`, rewrite the Day 17 section: title → `### Day 17 — DSK Live Bank Sync (Enable Banking)`; check off the delivered items (live pull via PSD2, consent flow, ETL reuse, sync button, expired-consent handling); annotate: GoCardless closed to new signups July 2025 → pivoted to Enable Banking; sandbox-verified; production consent pending a DSK Direct signing method (external blocker — swap `EB_APP_ID`/`EB_PRIVATE_KEY`/`EB_ASPSP_NAME`/`EB_ASPSP_COUNTRY` secrets when unblocked, zero code change); link the spec.

- [ ] **Step 3: Commit**

```bash
git add teftera-build-plan.md
git commit -m "docs(day17): check off DSK live sync (Enable Banking, sandbox-verified)"
```

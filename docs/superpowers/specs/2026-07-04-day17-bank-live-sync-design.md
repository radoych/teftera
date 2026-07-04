# Day 17 — DSK Live Bank Sync (Enable Banking) — Design

Date: 2026-07-04
Status: Approved (pending implementation plan)

Personal finance app for a shared two-person household. Day 17 adds a **live bank
connection** to DSK Bank Bulgaria: a "Синхронизирай с ДСК" button pulls the last
90 days of transactions over PSD2 and feeds them into the **same preview → dedupe →
confirm pipeline** the CSV import already uses. This is the project's first
server-side code: three Supabase Edge Functions that hold the provider secrets.

---

## Provider decision (supersedes the build plan)

The build plan named **GoCardless Bank Account Data**, but GoCardless closed BAD to
new signups in **July 2025** and no account exists. Day 17 uses **Enable Banking**
instead:

- Free for personal use over official PSD2 APIs; individuals can register.
- Covers DSK Bank Bulgaria (confirmed — DSK appears in their ASPSP list and the
  production consent flow reached DSK Direct during provisioning).
- Same mechanics as GoCardless: user consents at the bank, ~90/180-day consent,
  transaction JSON pulls, ~4 unattended pulls/day bank rate limit.

### Provisioning (already completed, manual, one-time)

- Enable Banking account created; **sandbox** and **production** applications
  registered, both with redirect URL
  `https://kabevzkjocnrceqsdavw.supabase.co/functions/v1/bank-sync-callback`.
- Each application has an **Application ID** + downloaded **RSA private key
  (`.pem`)**. Keys are stored outside the repo and enter the system only as Edge
  Function secrets. **Never in git, never in the app bundle** (Rule 5).
- Public privacy/terms pages (required by EB) live as gists under the owner's
  GitHub account.
- **Production blocker (external):** activating the production app requires a DSK
  consent, which currently fails because the owner's DSK Direct profile has no
  signing method (no certificate / mToken). Resolving that is a DSK support task
  and does **not** block this slice — see "Sandbox-first" below.

## Decisions (locked)

1. **Sandbox-first.** All development and testing run against Enable Banking's
   sandbox application (mock banks). Production switchover = replacing the two
   Edge Function secrets (App ID + private key) — **zero code change**.
2. **Supplement, not replace.** CSV import stays: it is the fallback when consent
   expires and the only path to history older than 90 days. Live sync is a second
   source into the same import screen.
3. **Manual sync only.** A button, no background/scheduled pulls — same philosophy
   as the Day 14 AI summary (manual refresh, zero idle cost). Banks cap unattended
   access at ~4/day anyway. Scheduled sync is deferred to the Cloud Run phase.
4. **Edge Functions, not Cloud Run.** The secret-holding proxy is three small
   Supabase Edge Functions (free tier, already-in-stack vendor). All Enable
   Banking calls go through them; the client never sees the private key. The
   future Cloud Run service can absorb these endpoints later — the client talks
   to a `services/bank-sync.ts` seam, so the move is a base-URL change.
5. **ETL stays client-side.** The Edge Functions return (nearly) raw EB
   transaction JSON. Mapping to `NormalizedTransaction`, merchant cleaning,
   categorization (`resolveCategoryId`), dedup (`dedupeImport`), and insertion
   (`bulkInsertImported`) all reuse the existing, tested client code — exactly
   like the CSV path. No ETL logic is duplicated in Deno.
6. **One shared connection per household.** The household syncs one DSK account.
   `bank_connections` is household-scoped (Rule 3); either member may trigger a
   sync using the stored consent.
7. **Money rules unchanged.** Amounts are converted to integer euro cents
   (Rule 1). If EB ever returns BGN rows (legacy), the fixed 1.95583 rate applies
   and `original_amount`/`original_currency` are retained (Rule 2).

## Deferred (out of scope for Day 17)

- **Scheduled/automatic sync** (Supabase cron + Edge Function) — lands with the
  backend phase.
- **Removing CSV import** — intentionally kept forever as fallback + deep history.
- **Cloud Run migration** of the proxy endpoints.
- **Multiple bank connections / other banks** — one DSK connection per household.
- **Balance display** — transactions only.

---

## Server side — Supabase Edge Functions (new)

```
supabase/functions/
  _shared/eb.ts             JWT mint (RS256, kid = App ID) + EB fetch helper
  bank-sync-start/index.ts    POST — begin consent
  bank-sync-callback/index.ts GET  — EB redirect target
  bank-sync-transactions/index.ts POST — pull transactions
```

**Secrets** (via `npx supabase secrets set`): `EB_APP_ID`, `EB_PRIVATE_KEY`
(PEM), `EB_REDIRECT_URL`, `EB_STATE_SECRET` (random 32+ bytes for signing the
OAuth `state`). Sandbox↔production is only an `EB_APP_ID`/`EB_PRIVATE_KEY` swap.

### Auth model

- `bank-sync-start` and `bank-sync-transactions` require the caller's Supabase
  JWT (standard `Authorization` header; verified via the service client). The
  function resolves the caller's `household_id` from `household_members` and
  refuses if none.
- `bank-sync-callback` is called by the **browser redirect** from EB (no Supabase
  JWT). It carries our own signed `state` value (issued by `bank-sync-start`,
  containing household_id + user_id + expiry, HMAC-signed with
  `EB_STATE_SECRET`) so the callback can trust which household the consent
  belongs to.

### `bank-sync-start` (POST)

1. Verify caller → household.
2. Mint an EB JWT, `POST /auth` to Enable Banking with the DSK ASPSP (sandbox:
   mock ASPSP), our redirect URL, and the signed `state`.
3. Return `{ url }` — the bank consent URL the app opens in the browser.

### `bank-sync-callback` (GET)

1. Validate the signed `state` (integrity + expiry).
2. Exchange the `code` query param with EB `POST /sessions` → session id,
   account uid(s), consent `valid_until`.
3. Upsert the household's row in `bank_connections`.
4. `302` redirect to `teftera://bank-sync?status=ok` (or `status=error&reason=…`)
   so the app resumes. The function renders a tiny fallback HTML page in case the
   deep link does not fire (browser tab left open).

### `bank-sync-transactions` (POST)

1. Verify caller → household; load the household's `bank_connections` row.
   Missing row → `409 not_connected`.
2. EB `GET /accounts/{uid}/transactions` for the last 90 days (paginated —
   follow `continuation_key` until absent).
3. Return `{ transactions: [...], validUntil }` (raw EB shape, booked entries).
4. EB session expired/revoked (401/403 from EB) → `409 consent_expired` so the
   client can prompt reconnection. EB rate-limit response → `429` passthrough.

Every EB response is parsed defensively; a malformed payload returns a typed
error, never a crash (Rule 6 spirit).

---

## Database — one migration

```sql
bank_connections
  id            uuid pk default gen_random_uuid()
  household_id  uuid not null references households on delete cascade
  created_by    uuid not null references auth.users
  provider      text not null default 'enable_banking'
  session_id    text not null
  account_uid   text not null
  bank_name     text not null default 'DSK Bank'
  valid_until   timestamptz not null
  created_at    timestamptz not null default now()
  unique (household_id)          -- one connection per household (Decision 6)
```

- RLS enabled with the standard household pattern for SELECT/DELETE; INSERT/
  UPDATE happen only via the callback function (service role). Applied through
  the Supabase MCP `apply_migration` (local file renamed to the stamped version,
  per project convention). No realtime on this table.
- `session_id` grants read access to bank data, so the client must not be able
  to read it: the migration revokes table-level SELECT from `authenticated` and
  grants column-level SELECT on only `id, household_id, bank_name, valid_until,
  created_at`. The Edge Functions read the full row via the service role.

---

## Client side

### `services/bank-sync.ts` (the seam)

- `startBankSync(): Promise<string>` → calls `bank-sync-start`, returns consent
  URL.
- `fetchBankTransactions(): Promise<EbTransaction[]>` → calls
  `bank-sync-transactions`; throws typed `NotConnectedError` /
  `ConsentExpiredError` / `RateLimitedError`.
- `normalizeEbTransaction(tx: EbTransaction): NormalizedTransaction | null`
  (pure, tested) — maps EB's booked-transaction shape (amount + currency,
  booking date, remittance info / creditor name) to the exact shape
  `normalizeDskRow` produces: EUR integer cents, cleaned merchant
  (`cleanMerchant`/`normalizeMerchant` reused), ISO date, category guess via
  `resolveCategoryId` input shape. Returns `null` for credit/income rows and
  unparseable entries (counted, surfaced in the preview's "other" bucket like
  the CSV path).

### `app/import-dsk.tsx` (edited, same screen, two sources)

- Idle state gains a second action: **"Синхронизирай с ДСК"** next to the
  existing file-pick action (two actions → side-by-side per the action-row
  rule, rendered by the existing `FloatingActionBar`/action components).
- Sync path: no connection → `startBankSync()` → `expo-web-browser` opens the
  consent URL → deep-link `teftera://bank-sync?status=ok` returns → fetch →
  normalize → **exact same preview** (`toImport` / `duplicates` / income) →
  confirm → `bulkInsertImported` → `refreshTransactions`. Existing connection →
  skip straight to fetch.
- A small caption under the header shows connection status when one exists:
  "Свързано с ДСК · валидно до 02.10.2026".

### Error handling (client)

- `ConsentExpiredError` / `NotConnectedError` → the sync action relabels to
  **"Повторно свързване с ДСК"** and relaunches the consent flow. No dead end.
- `RateLimitedError` → Alert "Лимитът на банката е достигнат — опитайте по-късно."
- Consent browser dismissed / deep link with `status=error` → back to idle with
  a non-blocking alert. Nothing imports without the user confirming the preview.

---

## Testing

Pure unit tests (Jest), matching existing slices:
- `normalizeEbTransaction` — debit mapping to EUR cents; sign conventions;
  merchant extraction order (creditor name → remittance fallback) + cleaning;
  BGN legacy row → 1.95583 conversion with originals retained; credit rows and
  malformed rows → `null`.
- `state` HMAC helpers (if implemented as shared TS): sign/verify round-trip,
  expiry rejection. (Deno-side logic mirrored by tests where import is feasible;
  otherwise covered by the function smoke test.)
- Reuse guarantee: preview/dedupe path is already covered by
  `dedup.test.ts` — no new tests needed there.

Edge Functions: `npx supabase functions serve` locally + a scripted smoke run
against the **EB sandbox** (start → manual mock-bank consent → callback →
transactions). Recorded sandbox JSON becomes fixtures for the normalizer tests.

---

## Checkpoint

On a device: tap "Синхронизирай с ДСК" → mock-bank consent in the browser → app
resumes → preview shows the sandbox transactions with categories and dedup →
confirm → rows appear in History in EUR cents. Re-running the sync shows them
under "duplicates". Deleting the `bank_connections` row and syncing again
triggers the reconnect flow.

**Production checkpoint (deferred until DSK enables a signing method):** swap
secrets to the production app, run the real DSK consent once, and pull real
transactions. No code changes expected.

## File map

```
supabase/functions/_shared/eb.ts                 EB JWT + fetch helper
supabase/functions/bank-sync-start/index.ts      consent start
supabase/functions/bank-sync-callback/index.ts   consent callback + upsert
supabase/functions/bank-sync-transactions/index.ts  transaction pull
supabase/migrations/<stamped>_bank_connections.sql  table + RLS
services/bank-sync.ts                            client seam + normalizer (tested)
app/import-dsk.tsx                               second source: live sync (edited)
```

New client dep: `expo-web-browser` (free, first-party Expo). No other deps.

# Code Review — 2026-07-18

Full-codebase review (Claude Code). Baseline at review time: `tsc --noEmit` clean,
`expo lint` clean, **351/351 tests pass**. Nothing here is broken — these are the
changes I would make, ranked by how much they matter.

---

## What's already good (don't touch)

- Money-as-integer-cents discipline is applied consistently; every display path goes
  through `formatCurrency`.
- Service seams are real: Gemini only in `services/gemini.ts`, EB only behind the edge
  functions, transactions I/O only in `features/transactions/api.ts`. The planned move
  to Cloud Run genuinely is a one-file change.
- Dependency-injected pure logic (`runDetection`, `runBudgetCheck`, `refreshSummary`,
  `saveReceiptTransaction`) is why 351 tests exist and pass fast.
- `bank_connections` security layering (RLS + column-level grants hiding `session_id`,
  HMAC-signed OAuth state, constant-time verify) is well done.
- Non-obvious workarounds are documented in place (realtime channel seq suffix,
  base64 PEM secret, Expo Go file-picker choice).

---

## Priority 1 — would change soon

### 1. Move Gemini calls server-side (the key ships in the client bundle)
`services/gemini.ts:18` reads `EXPO_PUBLIC_GEMINI_API_KEY`, so the key is extractable
from every build. CLAUDE.md rule 5 already flags this as temporary — but the original
blocker is gone: the bank-sync work built the full edge-function pattern (shared
helpers, `getCallerHousehold`, secrets management). Add a `gemini-extract` /
`gemini-summary` edge function pair holding the key as a Supabase secret, and have
`services/gemini.ts` call them the way `services/bank-sync.ts` calls its functions.
The service seam means no screen changes.

### 2. Auth bootstrap has no failure path — cold start offline hangs on the splash
`features/auth/bootstrap.ts:24` — `applySession` awaits `getMyHousehold()` with no
try/catch, and `supabase.auth.getSession().then(...)` (line 37) has no `.catch`. If the
household query fails (flaky network at cold start), the rejection is unhandled and
`status` stays `'loading'` forever — the user is stuck on the splash with no retry.
Wrap it: on error, either retry with backoff or set an `'error'` status the root layout
can render with a retry button.

### 3. Validate the extraction result — a bad total silently becomes €0.00
`services/gemini.ts:61-80` — `normalize()` maps a missing/hallucinated `total` to
`toCents(undefined) → 0` and still returns `ok: true`. The confirm screen then opens
pre-filled with €0,00 as if extraction succeeded. Treat `totalCents <= 0` (and arguably
an empty merchant + no items) as extraction failure so the user lands on the honest
manual-entry fallback instead.

### 4. Use Gemini structured output instead of prompt-and-strip-fences
`services/gemini.ts:51-54, 120` — the current approach (prompt begging for minified
JSON, then regex-stripping markdown fences) is the fragile pre-structured-output
pattern. `gemini-2.5-flash` supports
`generationConfig: { responseMimeType: 'application/json', responseSchema: ... }`,
which removes the fence-stripping and most non-retryable parse failures. Keep the
try/catch fallback (rule 6) — it just fires far less often.

### 5. Unbounded transaction fetch, refetched wholesale on every change
`features/transactions/api.ts:61-70` — `listTransactions` does `select('*')` on the
entire household history, and the realtime handler (`sync.ts:53`) re-runs the full
load (categories + transactions + anomalies + budgets) on **every** insert/update.
With live bank sync now feeding the table, this grows without bound; a 90-day bulk
import fires a refetch storm. Fine today for a two-person household, but I would:
- select only the columns `Transaction` actually uses (drop `*`),
- add a windowing strategy (e.g. last 12 months by default; older on demand),
- debounce the realtime-triggered reload (a bulk insert of 60 rows = 60 refetches).

---

## Priority 2 — would change when nearby

### 6. Recompute dedupe at import time (preview race)
`app/import-dsk.tsx:128, 205` — the dedupe preview is computed against the store
snapshot at parse time, but `onImport` inserts the previewed rows as-is. If the partner
adds matching transactions (or a bank sync lands) between preview and import,
duplicates slip through. `dedupeImport` is cheap and in-memory — re-run it inside
`onImport` against `useTransactionsStore.getState().transactions` before inserting.

### 7. EB income rows show the wrong counterparty
`services/bank-sync.ts:20-28, 48-49` — for `CRDT` (income) transactions the
counterparty is `debtor.name`, not `creditor.name` (that's you). `debtor` isn't even in
the `EbTransaction` interface, so income rows in the preview show remittance noise or
an empty merchant. Add `debtor` and pick by `credit_debit_indicator`. (Income isn't
imported, but the preview displays it.)

### 8. Filter zero-amount DSK rows
`services/dsk-import.ts:207-210` — a row with both debit and credit empty (fees
reversals, some info rows) becomes an `expense` of 0 cents and shows up in the import
preview. Drop rows whose parsed amount is 0 in `parseDskCsv`/`normalizeDskRow`.

### 9. Merchant knowledge is split across two rule lists
`services/dsk-import.ts:143` (`BRAND_RULES`) and `lib/categories.ts:42`
(`MERCHANT_RULES`) both know about Lidl/Kaufland/Billa/OMV/Shell/Netflix/Spotify —
two lists to keep in sync. Concrete bug this already caused: `dm` is normalized to the
brand "dm" by `BRAND_RULES`, but `MERCHANT_RULES` has no dm/drugstore rule, so every
dm purchase lands in "Other". I'd merge into one table
(`[pattern, brandName, category]`) in `lib/categories.ts` that both consumers derive
from — and add the dm → Shopping (or Health) rule either way.

> **Update (2026-11):** done — one merchant table now feeds both, and household
> vendor aliases (`features/vendors`) sit in front of it: an import first resolves
> a recognized name, then falls back to the static rules.

### 10. Auth listener churns on every token refresh
`features/auth/bootstrap.ts:38-40` — `onAuthStateChange` re-runs the full
`applySession` (including the `getMyHousehold()` DB query and a status write) on
`TOKEN_REFRESHED`, which fires roughly hourly. Skip the requery when the user id
hasn't changed.

### 11. Stale `now` on the long-lived Insights tab
`app/(app)/insights.tsx:70` — `now = useMemo(() => new Date(), [])` is frozen for the
tab's lifetime, and expo-router keeps tab screens mounted. After midnight (or month
rollover) "this month", the comparison range, and budget month are stale until app
restart. Refresh it with `useFocusEffect`, and also inside `onRefresh`.

### 12. Break up the big screens
`app/(app)/insights.tsx` (521 lines), `app/import-dsk.tsx` (387), `app/(app)/profile.tsx`
(382) each hand-roll multiple sections inline. The architecture already reserves
`features/<x>/components/` for this. Insights is the clearest win: extract
`BudgetSection`, `AnomalyCards`, `TrendBars`, `TopMerchants`, `AiSummaryCard` into
`features/insights/components/`. Purely mechanical, big readability payoff.

### 13. Silent truncation in `bank-sync-transactions`
`supabase/functions/bank-sync-transactions/index.ts:58-62` — when `MAX_PAGES` is hit
with a continuation key still present, the function logs a warning but returns a plain
200. The client can't tell the result is partial. Return `truncated: true` in the body
and surface a "partial sync" notice in the import screen.

---

## Priority 3 — polish / notes

- **`lib/formatCurrency.ts:46`** — a new `Intl.NumberFormat` is constructed on every
  call, and it's called in every transaction row render. Cache one formatter at module
  level (locale/options never vary).
- **`services/dsk-import.ts:38-39`** — `.replace(/ /g, '')` is redundant (the following
  `\s` replace covers it). Also note: a dot-decimal amount ("1234.56") would silently
  parse ×100 wrong since all dots are treated as thousands separators — safe for DSK's
  fixed format, but worth a guard or at least a comment if this parser is ever reused.
- **`services/dsk-import.ts:192-200`** — `occurredAtISO` falls back to returning the
  bare date string when the date doesn't match, though the field is documented as an
  ISO timestamp. Return the midnight ISO instead so the contract holds.
- **`features/anomalies/detect.ts:5`** — category history is all-time, so pre-2026
  BGN-era spending levels skew the mean/σ forever. Window it (e.g. last 6–12 months
  or last N transactions). Longer-term, a median/MAD score is more robust than z-score
  on heavy-tailed spending data — fits the planned server-side model migration.
- **`features/receipts/save.ts:23-27`** — the accepted orphan-receipt-on-failure
  tradeoff could now be closed cheaply with a single `security definer` RPC (migration
  infra is mature); low urgency.
- **`supabase/functions/_shared/eb.ts:114-120`** — `getCallerHousehold` picks the
  earliest-joined household when a user belongs to several; fine under the current
  one-household model, but worth a comment stating that assumption.
- **`services/bank-sync.ts:124-131`** — `getBankConnection` returns `null` for both
  "no connection" and "query failed", so a transient error renders the screen as
  not-connected. Minor; distinguish if it ever matters for UX.
- **Repo housekeeping** — uncommitted working-tree changes: `.mcp.json` flips the
  Supabase MCP off `read_only` (decide and commit), and `.claude/settings.json` is
  untracked and not gitignored (commit it or ignore it). Also `.mcp.json` lacks a
  trailing newline.

---

## Suggested order of attack

1. (#2) Auth bootstrap failure path — small, fixes a real hang.
2. (#3 + #4) Extraction validation + structured output — one file, `services/gemini.ts`.
3. (#6, #8) Import-time dedupe + zero-row filter — small, protects data quality.
4. (#9) Unify merchant rules (fixes the dm→Other bug as a side effect).
5. (#1) Gemini edge functions — the one with real security value; ~an evening given
   the existing bank-sync pattern.
6. (#5, #12) Fetch windowing + screen extraction — larger refactors, schedule as their
   own sessions.

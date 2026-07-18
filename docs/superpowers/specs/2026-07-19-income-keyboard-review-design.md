# Design: Income tracking, keyboard handling, and code-review fixes

**Date:** 2026-07-19
**Status:** Approved by owner (design discussion in-session)
**Companion doc:** `docs/code-review-2026-07-18.md` (the review whose items this spec implements)

---

## 1. Goals

1. **Full income tracking** — income categories and income transactions across manual
   entry, CSV/bank import, history, and all aggregates.
2. **Keyboard handling** — focused text fields always visible while the keyboard is up,
   via `react-native-keyboard-controller`.
3. **All code-review changes** from `docs/code-review-2026-07-18.md` (items #1–#13 and
   the Priority-3 polish list), in full — including 12-month fetch windowing and
   splitting the three large screens into feature components.

### Non-goals

- Receipt scanning stays expense-only (no income toggle on confirm-receipt).
- No net-worth / savings-rate analytics — income appears as totals and list rows only.
- The orphan-receipt-on-failure tradeoff in `saveReceiptTransaction` stays accepted
  (review polish item; explicitly deferred).
- No transfer/internal-movement detection (own-account transfers import as income
  and can be deleted by hand).

---

## 2. Income tracking

### 2.1 Data model — decision

`kind text not null default 'expense'` with `check (kind in ('expense','income'))` on
**both** `categories` and `transactions`.

Rejected alternatives:
- *Signed amounts* (income = negative cents) — breaks the positive-integer-cents
  invariant in every aggregate, formatter, and test.
- *Derive transaction kind from category kind* — uncategorized income is
  unrepresentable, and category deletion (FK `on delete set null`) would silently
  reclassify income as expense.

### 2.2 Migration (one file, applied via Supabase MCP `apply_migration`)

- `alter table categories add column kind ... default 'expense'` + check constraint.
- `alter table transactions add column kind ... default 'expense'` + check constraint.
  (Backfill is implicit: every existing row is an expense — income was never stored.)
- Update `seed_default_categories()` to also insert two income categories:
  - **Заплата** — icon `payments`, color `#d8e3ff`, `kind='income'`, `is_default=true`
  - **Друг приход** — icon `account-balance-wallet`, color `#c4c6d0`, `kind='income'`, `is_default=true`
- One-off backfill: insert those two income categories for every **existing** household
  that lacks them (guarded `insert … select … where not exists`).
- Per project memory: apply via MCP, then rename the local migration file to the
  MCP-stamped version.

### 2.3 Type & API changes

- `Transaction` (`features/transactions/types.ts`): add `kind: 'expense' | 'income'`.
- `CategoryLite` (`features/transactions/groupByDay.ts`): add `kind: 'expense' | 'income'`.
- `listCategories` / `listTransactions`: select the new column (explicit column lists —
  see §4 windowing).
- `NewTransaction` + `createTransaction`, `ImportedTransaction` + `bulkInsertImported`:
  carry `kind` through to the insert.
- New pure helpers in `features/transactions/` (single choke point for "spend math"):
  - `expensesOnly(txs)` — `txs.filter(t => t.kind === 'expense')`
  - `incomeOnly(txs)` — the complement
  - `expenseCategories(cats)` / `incomeCategories(cats)`

### 2.4 Category rules (`lib/categories.ts`)

- `DEFAULT_CATEGORIES` entries gain `kind`; the two income categories are added.
- New `INCOME_RULES: [RegExp, string][]` — e.g. `/заплата|salary|payroll|възнаграждение|осигур/i → 'Заплата'`;
  fallback **Друг приход**. New `guessIncomeCategory(merchant)`.
- `resolveCategoryId(merchant, categories, kind = 'expense')` becomes kind-aware:
  expense path unchanged; income path uses `guessIncomeCategory` and falls back to
  the household's Друг приход, then null.
- **Merchant-rule unification (review #9):** one authoritative table
  `MERCHANT_TABLE: ReadonlyArray<[RegExp, brand: string | null, category: string]>`
  in `lib/categories.ts`. `guessCategory` reads pattern+category;
  `services/dsk-import.ts` imports the derived brand list instead of its own
  `BRAND_RULES`. The **PERSONAL MERCHANTS** owner-maintained section stays at the top,
  first-match-wins (policy per project memory). Fixes the `dm → Other` gap
  (dm → Shopping).

### 2.5 Screens & flows

- **Manual entry** (`app/manual-entry.tsx`): a Разход/Приход `SegmentedToggle` above
  the amount. Income mode: category picker lists income categories only, auto-guess
  is off, default category Друг приход, saved with `kind='income'`. Edit mode
  seeds the toggle from the transaction and keeps it editable. Anomaly detection and
  budget check are **skipped for income** saves.
- **Import screen** (`app/import-dsk.tsx`): income rows become importable. The preview
  gets three sections — Нови (expenses), Приходи (income, importable, `+` amounts),
  Дубликати. Income rows get `resolveCategoryId(merchant, cats, 'income')`. The
  import-count button label counts both. Dedup covers income too (see §2.6).
- **History**: `toTransactionView` sets `isIncome` from `tx.kind`; `TransactionRow`
  already renders `+` and the distinct color (pre-built). Filters unchanged (category
  filter naturally includes income categories).
- **Dashboard** (`app/(app)/index.tsx`): all spend numbers (`dayTotalCents`,
  `monthTotalCents`, `spendingByCategory`, recent-list stays mixed) computed over
  `expensesOnly(transactions)`.
- **Insights**: hero total, category breakdown, monthly trend, top merchants, and the
  comparison % are expense-only. One new line under the hero:
  `Приходи: +€X` (tertiary color) for the selected range/scope, hidden when 0.
- **Budgets** (`app/budgets.tsx` + `runBudgetCheck`): iterate
  `expenseCategories(categories)`; spend math over `expensesOnly`.
- **AI summary** (`buildSummaryInput`): expense-only input (callers pass
  `expensesOnly`); prompt/summary format unchanged.
- **Anomalies** (`runDetection` / `historyForCategory`): guard — income transactions
  are never scored; history windowed (see §4.3).
- **Categories screen** (`app/categories.tsx`): two sections (Разходи / Приходи);
  add/edit sheet gets a kind `SegmentedToggle` (locked when editing an existing
  category — changing kind of a used category would silently reclassify history).
- **Reports (PDF)**: spend sections expense-only; the summary table gains one
  Приходи total row for the month.

### 2.6 Dedup (`features/transactions/dedup.ts`)

`importKey` gains `kind`: `kind|date|cents|merchant`. All existing DB rows are
expenses, so existing behavior is preserved; an income and an expense with identical
date/amount/merchant no longer shadow each other.

---

## 3. Keyboard handling

**Library:** `react-native-keyboard-controller` (MIT, free). Owner uses a custom
dev/EAS build, so the native module is acceptable.

- `KeyboardProvider` wraps the app in `app/_layout.tsx`.
- `components/Screen.tsx`: scroll mode renders the library's
  `KeyboardAwareScrollView` (props preserved: refresh control, padding, classes) with
  `bottomOffset` clearing the floating action bar.
- Form screens with their own ScrollView (`app/manual-entry.tsx`,
  `app/confirm-receipt.tsx`, auth screens / `AuthShell`, household setup) switch to
  `KeyboardAwareScrollView`.
- `FloatingActionBar`'s `liftWithKeyboard` keeps the existing
  `useKeyboardHeight`-based lift (works; can migrate to `KeyboardStickyView` later).
- Android: keep `softwareKeyboardLayoutMode` default (`resize`); the library manages
  insets itself.

**⚠️ Rollout consequence:** first native dependency added since the last build — the
owner must rebuild the dev client once (`eas build --profile preview` or
`npx expo run:android`) after this lands. JS-only OTA updates will not carry it.

---

## 4. Code-review changes

Reference: `docs/code-review-2026-07-18.md`. All items included. Design decisions for
the non-mechanical ones:

### 4.1 #1 + #3 + #4 — Gemini moves server-side, validated, structured

Two new Edge Functions (same auth pattern as bank-sync — `getCallerHousehold` from
`_shared/eb.ts`, generalized into `_shared/auth.ts`):

- **`gemini-extract`** — `POST { image: base64, mimeType }` → calls
  `gemini-2.5-flash` (`generateContent` REST) with
  `generationConfig: { responseMimeType: 'application/json', responseSchema: <receipt shape> }`
  → returns `{ json: <parsed> }` or a typed error status (401/422/429/502).
- **`gemini-summary`** — `POST { prompt }` (client-built Bulgarian prompt, server caps
  length at 2 000 chars) → returns `{ text }`.

`GEMINI_API_KEY` becomes a Supabase secret (single-line — safe on this Windows box
per project memory). `services/gemini.ts` becomes a thin client: same public API
(`extractReceipt`, `generateInsightsSummary`, retry/backoff, never-throw contract),
now calling the functions with the user's JWT. `isGeminiConfigured` keys off Supabase
config. **Validation (#3):** `normalize` result with `totalCents <= 0` → `ok: false`
(manual-entry fallback). `EXPO_PUBLIC_GEMINI_API_KEY` is removed from client code;
drop it from `.env` after verifying the functions.

### 4.2 #2 — auth bootstrap failure path

`AuthStatus` gains `'error'`. `applySession` wraps the household lookup in
try/catch → `setStatus('error')`; `getSession()` gets a `.catch` → same.
`resolveRedirect('error', …)` → no redirect. Root layout renders a minimal retry
screen (message + Опитай отново pill) that re-runs the bootstrap. **#10** rides
along: skip the requery + status writes when the auth event carries the same user id
and status is already `ready`.

### 4.3 #5 — fetch windowing + refetch debounce (full)

- `listTransactions`: explicit column list; `.gte('date', windowStartISO)` where
  `windowStartISO` = first day of the month 11 months back (≈12 visible months) —
  computed by a tested pure helper in `lib/dates.ts`.
- Realtime → reload gets a trailing **400 ms debounce** (pure, tested helper) so a
  60-row bulk import triggers one refetch.
- Anomaly history (`historyForCategory`) additionally windows to the **last 6
  months**, fixing the BGN-era skew (review polish item).
- **Accepted + surfaced consequences:** history/insights cover the last 12 months;
  dedup can only check the window, so the import preview shows a notice when a file
  contains rows older than the window ("рядове преди <month> не се проверяват за
  дубликати").

### 4.4 #12 — screen extraction (full)

No behavior change; components keyed to visible sections:

- `app/(app)/insights.tsx` → `features/insights/components/`: `AiSummaryCard`,
  `CategoryBreakdownList`, `MonthlyTrendBars`, `TopMerchantsList`, `BudgetSection`,
  `AnomalyCards`, `MonthPickerSheet`.
- `app/(app)/profile.tsx` → `features/household/components/`: `ProfileHeader`
  (avatar/name/email + edit-name sheet), `MembersSection` (member list + invite);
  `features/preferences/components/`: `PreferenceToggles` (notifications switches),
  `LayoutSheet` (dashboard-section editor sheet); `BankConnectionSection` →
  `features/transactions/components/`. The static Валута/Език pills and the General
  section stay in the screen file.
- `app/import-dsk.tsx` → `features/transactions/components/import/`:
  `ImportPreviewList`, `ImportSummary`, `ImportRow`.

### 4.5 Remaining review items (mechanical)

- **#6** document the `accounts[0]` single-account assumption in
  `bank-sync-callback` (comment; no account picker).
- **#7** add `debtor` to `EbTransaction`; counterparty = `debtor.name` for CRDT,
  `creditor.name` for DBIT.
- **#8** drop zero-amount rows in both normalizer paths (CSV + EB).
- **#11** Insights `now` refreshes via `useFocusEffect` (state tick) and inside
  `onRefresh`.
- **#13** `bank-sync-transactions` returns `truncated: true` when `MAX_PAGES` is hit;
  import screen shows a partial-sync notice.
- **Polish:** module-level cached `Intl.NumberFormat` in `formatCurrency`; drop the
  redundant replace in `parseBgAmount` (+ dot-decimal guard comment); `occurredAtISO`
  invalid-date fallback returns midnight ISO instead of a bare date; single-household
  assumption comment in `getCallerHousehold`; `getBankConnection` logs errors in dev
  so "no connection" vs "query failed" is distinguishable.
- **Housekeeping:** commit `.mcp.json` (read-write MCP needed for migrations) with
  trailing newline, and commit `.claude/settings.json`.

---

## 5. Testing

TDD (red → green) for all pure logic; existing 351 tests stay green (updated where
shapes change — e.g. `importKey`, `CategoryLite`). New/updated suites:

| Area | Tests |
|---|---|
| kind helpers | `expensesOnly` / `incomeOnly` / category splits |
| income rules | `guessIncomeCategory`, kind-aware `resolveCategoryId` |
| merchant table | unified table drives both brand + category; dm→Shopping; personal-section precedence |
| dedup | kind in key; expense/income no longer collide; old keys unchanged |
| import | zero-amount rows dropped (CSV + EB); EB debtor/creditor pick |
| windowing | window-start helper; out-of-window detection for the import notice |
| debounce | trailing debounce helper |
| gemini client | ok/error mapping from function responses; `totalCents <= 0` → not ok; retry on 429/5xx |
| bootstrap | `'error'` status transitions; same-user refresh skip; `resolveRedirect` with `'error'` |
| aggregates | expense-only dashboard/insights/summary-input/budget math with mixed-kind fixtures |

Screens verified by `tsc`, `expo lint`, and a manual run; edge functions verified
against the live project after deploy (extract a test receipt; generate a summary).

## 6. Rollout order

1. Migration (kind columns + seeds) — additive, old app version keeps working.
2. Code changes + tests land in small conventional commits.
3. Deploy edge functions, set `GEMINI_API_KEY` secret, verify, then remove the
   `EXPO_PUBLIC_GEMINI_API_KEY` usage.
4. Owner rebuilds the dev client (native dep added) — `eas build --profile preview`.
5. Remove `EXPO_PUBLIC_GEMINI_API_KEY` from `.env` once the new build is verified.

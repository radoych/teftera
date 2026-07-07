# Teftera — Day-by-Day Build Plan

Each "day" = one focused work session (~2–3 hours). Adjust pace to your schedule.
Days 1–5 are covered by the starter prompt. This plan extends the full build.

---

## Phase 1 — Foundation

### Day 1 — Scaffold & Design System

- [x] Init Expo + TypeScript + NativeWind
- [x] Configure NativeWind with all color, typography, spacing tokens from CLAUDE.md
- [x] Set up expo-font + Plus Jakarta Sans + Inter
- [x] Set up `.env`, `.gitignore`, initial `README.md`
- [x] Stub `/services/supabase.ts` and `/services/gemini.ts`
- [x] Build shared components: `BottomNav`, `HairlineDivider`, `SectionLabel`, `PillButton`, `BackgroundGlow`
- [x] Confirm bottom nav renders correctly with BlurView, all 4 tabs

**Checkpoint:** `npx expo start` runs, fonts load, background glow renders, bottom nav looks right.

---

### Day 2 — All 10 Screens (Static)

- [x] Convert all 10 Stitch HTML files to RN screens — read each HTML file first, match the markup
- [x] All screens navigable via Expo Router
- [x] Replace "Kinetic Precision" / "Aura Finance" → **Teftera** everywhere
- [x] Replace `$` → `€` in all sample data
- [x] Pill buttons use `borderRadius: 9999`
- [x] Material Symbols → MaterialIcons from @expo/vector-icons
- [x] Bottom nav BlurView on the 5 main-app screens, absent on auth/flow screens
- [x] Scanner screen: full-screen camera UI (static viewfinder placeholder for now)

**Checkpoint:** Tap through all screens. Everything renders. Matches the Stitch designs.

---

## Phase 2 — Auth & Household

### Day 3 — Supabase Schema + RLS

- [x] Create Supabase project, add URL + anon key to `.env`
- [x] Write initial migration: all 7 tables with correct types and relationships
- [x] Apply RLS to every table using the household_id policy pattern
- [x] Seed default categories (Groceries, Dining, Transport, Utilities, Entertainment, Health, Other)
- [x] Write unit tests for `formatCurrency` and BGN→EUR conversion
- [x] Confirm migration runs cleanly: `supabase db push` *(migrations applied via Supabase MCP `apply_migration`)*

**Checkpoint:** Tables exist in Supabase dashboard. RLS enabled on all. `npm test` passes.

---

### Day 4 — Auth + Household Flow

- [x] Sign in / sign up wired to Supabase Auth (email/password)
- [ ] Google OAuth configured in Supabase + Google Cloud Console — **deferred** to a follow-up slice (see `docs/superpowers/specs/2026-06-19-auth-household-flow-design.md`)
- [x] Auth state persists across app restarts (AsyncStorage session)
- [x] Household setup (create): creates `households` row + `household_members` row (via `create_household` RPC)
- [x] Household setup (join): validates `invite_code`, creates `household_members` row (via `join_household_by_code` RPC)
- [x] "Skip for now" creates a solo household (household always exists)
- [x] Redirect flow: new user → household setup → dashboard; returning user → dashboard
- [x] Profile screen shows real user name, email, and household members

> Implemented + reviewed on branch `feat/auth-household-flow`. Final on-device two-account checkpoint is the human's verification step.

**Checkpoint:** Sign up → create household → land on dashboard (static). Sign out → sign back in → dashboard again.

---

## Phase 3 — Core Transaction Flow

### Day 5 — Manual Entry + Transaction List (First Vertical Slice)

- [x] Manual entry form wired to Supabase — saves a real `transactions` row
- [x] Form validation with Zod: amount > 0, merchant not empty, date valid
- [x] Transaction history reads from Supabase, grouped by date
- [x] Dashboard total calculated from real data (current month)
- [x] Realtime subscription: both users see new transactions without refresh *(needs `supabase db push` of the realtime migration + the on-device two-device check)*
- [x] Basic loading states on history and dashboard
- [x] `feat: manual transaction entry and realtime history` commit *(landed as a per-task TDD commit series on `feat/day5-manual-entry-realtime`)*

> **Deferred to Day 6:** interactive category picker + date picker. Day 5 fixes the date to today and auto-resolves the category from the merchant (`guessCategory` rules). Plan: `docs/superpowers/plans/2026-06-22-day5-manual-entry-realtime-slice.md`.

**Checkpoint:** Add a transaction → appears on history list → dashboard total updates. Open the app on a second device logged in as the other user → transaction appears there too.

---

### Day 6 — Transaction Detail + Empty States

- [x] Tap a transaction row → transaction detail screen (inferred from design system, no mockup needed)
- [x] Detail shows: merchant, amount, category icon+name, date, note, added-by member, receipt thumbnail if exists
- [x] Edit and delete actions on detail screen
- [x] Empty states for: history (no transactions yet), dashboard (no data yet), insights (no data yet)
- [x] Unit tests for transaction normalization helpers

> Implemented + reviewed on branch `feat/day6-transaction-detail`. Read-only detail at `app/transaction/[id].tsx`, shared `EmptyState` component, `updateTransaction`/`deleteTransaction` API.

**Checkpoint:** Full CRUD on transactions. Empty states render correctly on a fresh household.

---

### Day 7 — Dashboard Wired to Real Data

- [x] Spending by category: query + group by category for current month
- [x] Recent transactions: last 5, with correct category icons
- [x] Monthly total + comparison to last month (% change)
- [x] Day / Month toggle on the home hero: switch the big total between today's spend and the current month
- [x] "Scan" and "Manual" floating action buttons navigate to correct screens
- [x] Per-person vs household toggle (filter by `user_id` vs all household members)
- [x] Pull-to-refresh

> Implemented on branch `feat/day7-dashboard-real-data`. New pure helpers in `features/transactions/dashboard.ts` (day/prev-month totals, `pctChange`, `filterByUser`, `spendingByCategory`) are unit-tested. Category breakdown is proportional `View` bars (no chart lib — consistent with charts-deferred). Reusable `SegmentedToggle` + `Screen` pull-to-refresh added. On-device two-device check is the human's verification step.

**Checkpoint:** Dashboard shows real totals and categories. Toggle switches between personal and household view.

---

## Phase 4 — Import & Receipt Scanning

### Day 8 — DSK CSV Import: File Picker + Parsing

- [x] File picker accepts `.csv` from DSK Bank export *(via `expo-file-system` `File.pickFileAsync`; `.xlsx` not implemented — CSV export covers the use case)*
- [x] Parser in `/services/dsk-import.ts` reads DSK-specific column format
- [x] Merchant normalizer: `DSK BORICA *KAUFLAND BG` → `Kaufland`, etc. (rule-based, expandable list)
- [x] Deduplication: skip rows already in DB (match on date + amount + merchant — `dedupeImport`/`importKey`)
- [x] BGN→EUR conversion for rows dated before 01.01.2026 at 1.95583 fixed rate, preserve `original_amount` + `original_currency`
- [x] Preview screen before committing: shows parsed rows, flags duplicates, shows conversion (`app/import-dsk.tsx`)
- [x] Unit tests for: DSK column parser, merchant normalizer, dedup logic, BGN→EUR

> Implemented + reviewed on branch `feat/day8-dsk-csv-import` (PR #10). Import entry point lives on the Profile screen.

**Checkpoint:** Import a real DSK CSV. Transactions appear normalized. Duplicates skipped. BGN amounts converted correctly.

---

### Day 9 — DSK Import: Auto-Categorization + ETL Complete

- [x] Rule-based auto-categorizer: merchant keyword → category (Kaufland/Lidl → Groceries, etc. — `guessCategory`)
- [x] Uncategorized rows fall back to **Other** (no review workflow — owner maintains the rules list; see DSK categorization policy)
- [x] Bulk import transaction: batch insert via `bulkInsertImported`, tagged `source: 'dsk_import'`
- [x] Last synced timestamp displayed (`lastDskSyncAt` / `formatLastSync` line on the History screen)
- [x] Import summary screen: "X transactions imported, Y duplicates skipped"
- [x] Unit test: categorization rules cover common Bulgarian merchants

> Implemented + reviewed on branch `feat/day9-dsk-categorize-sync` (PR #11). **Divergence from plan:** the import flow is reached from **Profile**, not a floating "Sync with DSK" pill on History (the pill was removed in `226a313`); History keeps only the last-synced line. Rows carry real transaction time via the `occurred_at` column. Per the categorization policy, unknown merchants map to **Other** rather than a "needs a category" review queue.

**Checkpoint:** Full import flow works end to end. Summary screen accurate. Uncategorized transactions default to Other.

---

### Day 10 — Receipt Scanner: Camera + Supabase Storage

- [ ] expo-camera live viewfinder on scanner screen
- [ ] Capture button → photo taken → stored to Supabase Storage under `receipts/{household_id}/{uuid}.jpg`
- [ ] Gallery picker as alternative to live capture
- [ ] Flash toggle works
- [ ] Loading state while uploading: "Uploading receipt..."
- [ ] On upload success → navigate to confirm-receipt screen with the storage URL
- [ ] Error state: upload fails → show retry option, never crash

**Checkpoint:** Photograph a receipt. It appears in Supabase Storage bucket.

---

### Day 11 — Gemini Receipt Extraction + Confirm Screen

- [x] `/services/gemini.ts`: `extractReceipt` function *(reused from Day 10 — takes local base64, not a signed URL)*
  - ~~Downloads image from Supabase Storage (signed URL)~~ → reads base64 from the captured local JPEG (no signed-URL round-trip)
  - Sends to Gemini 2.0 Flash with multimodal prompt
  - Returns normalized JSON `{ merchant, date, totalCents, currency, items:[{description, amountCents}] }`
  - Wraps JSON.parse in try/catch — falls back to `{ ok: false }` so the screen shows an empty manual form
- [x] Log raw Gemini response to console in dev (for building test set)
- [x] Confirm-receipt screen populated with extracted data *(extraction runs on the screen on mount, behind a loading state)*
- [x] All fields editable — empty/null fields show placeholder, not blank or hidden *(date → reused `DateField`, category → reused `CategoryPickerModal` with merchant auto-guess)*
- [x] "Save" → creates `receipts` row + `transactions` row linked via `receipt_id`
- [x] "Retake" → back to scanner
- [x] If extraction fully fails → all fields empty, user fills manually — same confirm screen, no separate error state

> Implemented + reviewed on branch `feat/day11-gemini-receipt-extraction` (subagent-driven, plan `docs/superpowers/plans/2026-06-26-day11-gemini-receipt-extraction.md`). Extraction runs on the confirm screen from the local captured image (base64, no signed URL). Line items are flattened into the transaction note (descriptions only); the total is authoritative with a soft, non-blocking reconciliation hint. Save inserts a `receipts` row then a linked `transactions` row (`source: 'receipt'`). **On-device checkpoint** (capture a real receipt in a dev-client build → extract → save → appears in History) is the human's verification step.

**Checkpoint:** Photograph a Kaufland receipt. Gemini extracts merchant + total. Fields pre-filled. Save creates the transaction.

---

### Day 11.5 — Internal Build & Distribution (out of sequence)

> Pulled forward from Day 18 so the household can actually *use* the app now, mid-build. Full release polish (icon/splash/README/store-ready) still lives in Day 18.

**Android — done:**
- [x] `eas.json` `preview` profile bound to the `preview` EAS environment (`environment: preview`) so `EXPO_PUBLIC_*` are injected at build time
- [x] Supabase + Gemini keys pushed to EAS `preview` environment via `eas env:push preview --path .env` (not committed; `.env` stays gitignored)
- [x] `eas build --platform android --profile preview` → internal-distribution **APK**, keystore auto-generated (build `7d253c8b`, v1.0.0)
- [x] Installable on Android directly via the EAS QR/link (no Play Store)

**iOS — free-tier sideload (no paid Apple account):**
- [ ] Build the iOS `.ipa` via `eas build --platform ios --profile preview` (free Apple ID → Personal Team development signing; one-time interactive Apple login + 2FA, EAS caches credentials)
- [ ] Sideload onto the iPhone with **AltStore Classic + AltServer** on Windows; AltServer auto-refreshes the 7-day signature over same-Wi-Fi
- [ ] Trust the developer profile on-device, sign into the shared household

> **Notes.** Both builds point at the **live production Supabase** (real household data, not a sandbox). Receipt scanning runs on `gemini-2.5-flash` with a manual-entry fallback (preview models 503'd too often). Future updates: a new `eas build` per version (credentials already saved); wiring `expo-updates` would let JS-only changes ship over-the-air via `eas update` without a reinstall. The original distribution step (EAS preview build on both phones) remains listed under **Day 18**, now partially satisfied here.

**Polish fixes found in the internal build (TODO):**
- [x] Fix the logo on the login (sign-in) page — it renders wrong / broken. *(Day 18: transparent `logo.png`)*
- [x] Remove the "Sign in with Google" control from the login page nav/header (Google OAuth is deferred — see Day 4; don't show a dead button). *(Day 18: removed from sign-in + sign-up)*
- [x] Amount inputs (manual-entry total, confirm-receipt total + item amounts): auto-place the decimal separator as digits are typed (cents-based entry — typing `1234` shows `12,34`), instead of requiring the user to type the `,`/`.` manually. *(Day 18: `formatDigitsAsAmount` live formatter)*

**Checkpoint:** App installed and running on the Android phone from the EAS APK; iOS path documented and ready to run (pending the one-time interactive build + AltStore install).

---

## Phase 5 — Intelligence

### Day 12 — Insights Screen: Real Data

- [x] Spending by category: real query, proportional bars, sorted high to low
- [x] Monthly trend: 6-month bar chart from aggregated data *(proportional Views — Victory Native XL deferred, see charts-deferred)*
- [x] Top merchants: ranked by total spent, selected range
- [x] Time range filter pills (This Month / Last Month / 3 Months / Year) actually filter the queries
- [x] Per-person vs household toggle
- [x] Loading skeletons while data fetches

> Implemented + reviewed on branch `feat/day12-insights-real-data` (subagent-driven, plan `docs/superpowers/plans/2026-06-28-day12-insights-real-data.md`). Pure helpers in `features/insights/` (`range.ts`, `aggregate.ts`) + a shared `categoryBreakdown` extracted from `dashboard.ts`; all unit-tested. Range pills scope the hero/category/merchant sections; the trend stays a fixed last-6-months view (person-aware). AI summary (Day 14) and Anomalies (Day 13) remain static placeholders. No chart library added; hero delta reuses the shared `Comparison` component.

**Checkpoint:** Insights screen shows real data. All filters work. Charts render correctly.

---

### Day 13 — Anomaly Detection

- [x] `/services/anomaly.ts`: Z-score function over transaction history per category *(pre-existing, reused)*
- [x] Runs after every new transaction is saved *(automatic on manual + receipt saves; no manual trigger)*
- [x] Threshold: |Z| > 2.5 → flag the transaction, create `anomalies` row
- [x] Flagged transactions render with `secondary-fixed` (`#c3f400`) accent in history list: dot on icon, lime amount text, reason label
- [x] Anomaly section on Insights screen shows flagged transactions with "Review" action
- [x] Mark-as-reviewed action clears the flag
- [x] Unit tests: Z-score function, threshold edge cases

> Implemented on branch `feat/day13-anomaly-detection` (plan `docs/superpowers/plans/2026-06-28-day13-anomaly-detection.md`). Detection runs automatically after manual + receipt saves (best-effort, never blocks the save), household-scoped, amount-only. New `features/anomalies/` slice (`detect`, `api`, `runDetection`, `reasons`) wraps the pre-existing tested Z-score engine; `createTransaction` now returns the new id; the store loads open anomalies so reasons render in history and sync via the existing realtime refetch. **Out of scope (v1):** edit re-scoring, DSK-import scoring, high-frequency detector, review-from-detail-screen.

**Checkpoint:** Make a transaction that's 3x your average for a category. It shows flagged in lime in the transaction list and on insights.

---

### Day 14 — AI Spend Insights (Gemini Natural Language Summary)

- [x] `/services/gemini.ts`: `generateInsightsSummary(monthlyData)` function
  - Builds a structured prompt from aggregated spend data for the current month
  - Returns a 2–3 sentence natural language summary
  - try/catch: on failure, show nothing (don't show an error in the UI, just hide the summary card)
- [x] Summary renders in the AI Summary section on Insights screen with the left accent line + sparkle icon
- [x] Regenerate on pull-to-refresh
- [x] Cache the summary in Zustand for the session (don't re-call Gemini on every tab switch)

> Implemented on branch `feat/day14-ai-spend-summary` (subagent-driven, plan `docs/superpowers/plans/2026-06-29-day14-ai-spend-summary.md`). Summary is fixed to **current-month household** scope (ignores the Insights range/person controls), session-cached in `summaryStore`, regenerated only on pull-to-refresh, hidden on failure/no-data. Uses `gemini-2.5-flash` with the shared transient retry; pure `buildSummaryInput` + `buildSummaryPrompt` + the `refreshSummary` orchestrator are unit-tested.

**Checkpoint:** Insights screen shows a natural language summary of your real spending. Pulling to refresh regenerates it.

---

### Day 15 — Budget Goals

- [x] Budget setup: set a monthly EUR amount per category from profile/settings (with carry-forward)
- [x] Budget progress bars on dashboard: current spend vs budget per category
- [x] Alert at 80%/over-budget threshold: **client-side local** notification, fired after each save with device-local dedup (ask for permission on first budget creation). Server/Expo push deferred; alerting excludes DSK bulk import.
- [ ] Telegram bot notification as alternative/backup (reuse the Telegram bot pattern from the café project) — **deferred**
- [x] Insights screen: budget vs actual section

**Checkpoint:** Set a €200 Groceries budget. Spend €160 → get a push notification. Dashboard shows progress bar at 80%.  *(on-device human checkpoint — pending)*

---

## Phase 6 — Polish & Portfolio

### Day 16 — PDF Monthly Report

- [x] "Export" button on Insights screen calls the generator, shares PDF via `expo-sharing`
- [x] Client-side PDF via `expo-print` (dark-themed HTML + CSS donut; month picker, last 12 months; household-scoped)
- [ ] FastAPI micro-service on GCP Cloud Run — **deferred** (isolated behind the `generateReportPdf` seam; see spec)
- [ ] Scheduled monthly auto-generation — **deferred** to the Cloud Run phase

> Implemented on branch `worktree-day16-pdf-report`. New pure `features/reports/`
> slice (`buildReportData`, `buildReportHtml`, `monthPickerOptions`) is unit-tested;
> the `generateReportPdf` seam keeps the Cloud Run swap a one-file change. AI summary
> is included only for the current month (reuses the cached Day 14 text — no extra
> Gemini call). Spec: `docs/superpowers/specs/2026-07-01-day16-pdf-report-design.md`.

**Checkpoint:** Tap Export on Insights. Receive a branded PDF with real data for the month.

---

### Day 17 — DSK Live Bank Sync (Enable Banking)

- [x] Supplement CSV import with live PSD2 pulls — **Enable Banking**, not GoCardless (GoCardless BAD closed to new signups July 2025)
- [x] OAuth consent flow: user authorizes bank → Enable Banking → Teftera (90-day re-auth cycle), signed-`state` handoff through the browser redirect
- [x] Pull last 90 days as JSON → same ETL/dedup/preview pipeline as CSV import (`normalizeEbTransaction` → `dedupeImport` → confirm screen)
- [x] "Синхронизирай с ДСК" button on the import screen alongside the CSV picker
- [x] Graceful expired-consent handling (button flips to "Повторно свързване с ДСК" and relaunches consent)
- [x] First server-side code: 3 Supabase Edge Functions (`bank-sync-start` / `-callback` / `-transactions`) hold the EB private key as secrets — nothing in the client bundle
- [ ] **Production DSK consent — blocked externally:** owner's DSK Direct profile needs a signing method (mToken/certificate). Everything is sandbox-verified end-to-end (mock bank, on-device); switching to production = swapping the `EB_APP_ID`/`EB_PRIVATE_KEY`/`EB_ASPSP_NAME`/`EB_ASPSP_COUNTRY` secrets. Zero code change.

> Implemented on branch `worktree-day17-bank-live-sync`. New `bank_connections` table
> (RLS + column-level privacy on `session_id`). EB private key stored base64 as an Edge
> Function secret. Sandbox fixture recorded into the normalizer tests.
> Spec: `docs/superpowers/specs/2026-07-04-day17-bank-live-sync-design.md`.

**Checkpoint (passed, sandbox):** Tap Синхронизирай с ДСК → mock-bank consent in browser → app resumes → preview with dedup → confirm → rows in History. Re-sync shows duplicates.

---

### Day 18 — Final Polish & Portfolio Prep

- [x] Error boundaries on every screen (shared `ScreenErrorFallback`, exported per route — layouts + standalone screens)
- [x] Network offline state — banner + disabled network actions (`expo-network`, not NetInfo: first-party, same capability; PDF export stays enabled — it's fully local)
- [x] Empty state illustrations on all 3 main screens (glow-ringed icon treatment + per-screen copy/CTAs; no art assets, per design decision)
- [x] App icon: anthemion logo composed on `#121316` by `scripts/generate-app-icons.mjs` (sharp) — no appicon.co needed, Expo generates sizes from 1024²
- [x] Splash screen using the logo (same generator)
- [x] `README.md` complete: architecture diagram, env var list, setup instructions — **screenshots pending** (human: fill `assets/screenshots/`)
- [ ] EAS `preview` build v1.0.1 — install on both phones via QR code (no app store needed); iOS first build needs the interactive Apple ID login
- [x] Portfolio write-up text — `docs/portfolio-writeup.md` (receipt OCR pipeline, PSD2 sync, ETL, anomaly detection, integer-cents model)

> Implemented on branch `feat/day18-final-polish` (plan
> `docs/superpowers/plans/2026-07-07-day18-final-polish-portfolio.md`). Also:
> repo hygiene — personal bank CSVs / photos / design sources gitignored,
> skills-exercise fixtures removed, stock Expo template assets deleted.
> Spec: `docs/superpowers/specs/2026-07-07-day18-final-polish-portfolio-design.md`.

**Checkpoint:** App installs from EAS on both phones. README has screenshots. You can walk through the whole app in a demo without hitting any crashes or missing states. *(Doubles as the pending Day 15 budget-notification check; also verify the error fallback and the airplane-mode banner on device.)*

---

## Summary Timeline

| Days  | Phase               | Deliverable                                      |
| ----- | ------------------- | ------------------------------------------------ |
| 1–2   | Foundation          | All screens navigable, design system implemented |
| 3–4   | Auth & Household    | Real login, shared household, Google OAuth       |
| 5–7   | Core Transactions   | Manual entry, history, realtime sync, dashboard  |
| 8–9   | DSK Import          | CSV ETL, normalization, BGN→EUR, auto-categorize |
| 10–11 | Receipt Scanner     | Camera, Gemini extraction, confirm/edit          |
| 12–13 | Insights & Anomaly  | Real charts, Z-score flagging                    |
| 14–15 | AI & Budgets        | Gemini summary, budget tracking, push alerts     |
| 16–17 | Reports & Bank Sync | PDF export, GoCardless (optional)                |
| 18    | Portfolio           | App icon, README, EAS build, write-up            |

**Minimum viable portfolio project = Days 1–15.** Days 16–17 are differentiators. Day 18 is what gets it in front of hiring managers.

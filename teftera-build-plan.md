# Teftera — Day-by-Day Build Plan

Each "day" = one focused work session (~2–3 hours). Adjust pace to your schedule.
Days 1–5 are covered by the starter prompt. This plan extends the full build.

---

## Phase 1 — Foundation

### Day 1 — Scaffold & Design System

- [ ] Init Expo + TypeScript + NativeWind
- [ ] Configure NativeWind with all color, typography, spacing tokens from CLAUDE.md
- [ ] Set up expo-font + Plus Jakarta Sans + Inter
- [ ] Set up `.env`, `.gitignore`, initial `README.md`
- [ ] Stub `/services/supabase.ts` and `/services/gemini.ts`
- [ ] Build shared components: `BottomNav`, `HairlineDivider`, `SectionLabel`, `PillButton`, `BackgroundGlow`
- [ ] Confirm bottom nav renders correctly with BlurView, all 4 tabs

**Checkpoint:** `npx expo start` runs, fonts load, background glow renders, bottom nav looks right.

---

### Day 2 — All 10 Screens (Static)

- [ ] Convert all 10 Stitch HTML files to RN screens — read each HTML file first, match the markup
- [ ] All screens navigable via Expo Router
- [ ] Replace "Kinetic Precision" / "Aura Finance" → **Teftera** everywhere
- [ ] Replace `$` → `€` in all sample data
- [ ] Pill buttons use `borderRadius: 9999`
- [ ] Material Symbols → MaterialIcons from @expo/vector-icons
- [ ] Bottom nav BlurView on the 5 main-app screens, absent on auth/flow screens
- [ ] Scanner screen: full-screen camera UI (static viewfinder placeholder for now)

**Checkpoint:** Tap through all screens. Everything renders. Matches the Stitch designs.

---

## Phase 2 — Auth & Household

### Day 3 — Supabase Schema + RLS

- [ ] Create Supabase project, add URL + anon key to `.env`
- [ ] Write initial migration: all 7 tables with correct types and relationships
- [ ] Apply RLS to every table using the household_id policy pattern
- [ ] Seed default categories (Groceries, Dining, Transport, Utilities, Entertainment, Health, Other)
- [ ] Write unit tests for `formatCurrency` and BGN→EUR conversion
- [ ] Confirm migration runs cleanly: `supabase db push`

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

- [ ] Tap a transaction row → transaction detail screen (inferred from design system, no mockup needed)
- [ ] Detail shows: merchant, amount, category icon+name, date, note, added-by member, receipt thumbnail if exists
- [ ] Edit and delete actions on detail screen
- [ ] Empty states for: history (no transactions yet), dashboard (no data yet), insights (no data yet)
- [ ] Unit tests for transaction normalization helpers

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

- [ ] File picker (expo-document-picker) accepts `.csv` and `.xlsx` from DSK Bank export
- [ ] Parser in `/services/dsk-import.ts` reads DSK-specific column format
- [ ] Merchant normalizer: `DSK BORICA *KAUFLAND BG` → `Kaufland`, etc. (rule-based, expandable list)
- [ ] Deduplication: skip rows already in DB (match on date + amount + merchant)
- [ ] BGN→EUR conversion for rows dated before 01.01.2026 at 1.95583 fixed rate, preserve `original_amount` + `original_currency`
- [ ] Preview screen before committing: shows parsed rows, flags duplicates, shows conversion
- [ ] Unit tests for: DSK column parser, merchant normalizer, dedup logic, BGN→EUR

**Checkpoint:** Import a real DSK CSV. Transactions appear normalized. Duplicates skipped. BGN amounts converted correctly.

---

### Day 9 — DSK Import: Auto-Categorization + ETL Complete

- [ ] Rule-based auto-categorizer: merchant keyword → category (Kaufland/Lidl → Groceries, etc.)
- [ ] Uncategorized rows flagged for manual review post-import
- [ ] Bulk import transaction: all-or-nothing, atomic insert (no partial imports)
- [ ] "Sync with DSK" button on transaction history screen (floating pill, replaces or joins existing pills)
- [ ] Last synced timestamp displayed near the button
- [ ] Import summary screen: "47 transactions imported, 3 duplicates skipped, 12 need a category"
- [ ] Unit test: categorization rules cover top 20 common Bulgarian merchants

**Checkpoint:** Full import flow works end to end. Summary screen accurate. Uncategorized transactions easy to find and fix.

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

- [ ] `/services/gemini.ts`: `extractReceipt(imageUrl)` function
  - Downloads image from Supabase Storage (signed URL)
  - Sends to Gemini 2.0 Flash with multimodal prompt
  - Prompt: _"Extract from this receipt: merchant name, total amount, currency, date, and line items if visible. Return ONLY valid JSON: { merchant, total_cents, currency, date, items: [{name, amount_cents}] }. If a field is not visible, return null for that field."_
  - Wraps JSON.parse in try/catch — fallback returns empty object on failure
- [ ] Log raw Gemini response to console in dev (for building test set)
- [ ] Confirm-receipt screen populated with extracted data
- [ ] All fields editable — empty/null fields show placeholder, not blank or hidden
- [ ] "Save" → creates `receipts` row + `transactions` row linked via `receipt_id`
- [ ] "Retake" → back to scanner
- [ ] If extraction fully fails → all fields empty, user fills manually — same confirm screen, no separate error state

**Checkpoint:** Photograph a Kaufland receipt. Gemini extracts merchant + total. Fields pre-filled. Save creates the transaction.

---

## Phase 5 — Intelligence

### Day 12 — Insights Screen: Real Data

- [ ] Spending by category: real query, proportional bars, sorted high to low
- [ ] Monthly trend: 6-month bar chart from aggregated data (Victory Native XL)
- [ ] Top merchants: ranked by total spent, current month
- [ ] Time range filter pills (This Month / Last Month / 3 Months / Year) actually filter the queries
- [ ] Per-person vs household toggle
- [ ] Loading skeletons while data fetches

**Checkpoint:** Insights screen shows real data. All filters work. Charts render correctly.

---

### Day 13 — Anomaly Detection

- [ ] `/services/anomaly.ts`: Z-score function over transaction history per category
- [ ] Runs after every new transaction is saved (or on a manual "analyze" trigger)
- [ ] Threshold: |Z| > 2.5 → flag the transaction, create `anomalies` row
- [ ] Flagged transactions render with `secondary-fixed` (`#c3f400`) accent in history list: dot on icon, lime amount text, reason label ("Unusual amount" / "High frequency")
- [ ] Anomaly section on Insights screen shows flagged transactions with "Review" action
- [ ] Mark-as-reviewed action clears the flag
- [ ] Unit tests: Z-score function, threshold edge cases

**Checkpoint:** Make a transaction that's 3x your average for a category. It shows flagged in lime in the transaction list and on insights.

---

### Day 14 — AI Spend Insights (Gemini Natural Language Summary)

- [ ] `/services/gemini.ts`: `generateInsightsSummary(monthlyData)` function
  - Builds a structured prompt from aggregated spend data for the current month
  - Returns a 2–3 sentence natural language summary
  - try/catch: on failure, show nothing (don't show an error in the UI, just hide the summary card)
- [ ] Summary renders in the AI Summary section on Insights screen with the left accent line + sparkle icon
- [ ] Regenerate on pull-to-refresh
- [ ] Cache the summary in Zustand for the session (don't re-call Gemini on every tab switch)

**Checkpoint:** Insights screen shows a natural language summary of your real spending. Pulling to refresh regenerates it.

---

### Day 15 — Budget Goals

- [ ] Budget setup: set a monthly EUR amount per category from profile/settings
- [ ] Budget progress bars on dashboard: current spend vs budget per category
- [ ] Alert at 80% threshold: Expo push notification (ask for permission on first budget creation)
- [ ] Telegram bot notification as alternative/backup (reuse the Telegram bot pattern from the café project)
- [ ] Insights screen: budget vs actual section

**Checkpoint:** Set a €200 Groceries budget. Spend €160 → get a push notification. Dashboard shows progress bar at 80%.

---

## Phase 6 — Polish & Portfolio

### Day 16 — PDF Monthly Report

- [ ] FastAPI micro-service on GCP Cloud Run (first time the optional backend is built):
  - Receives monthly aggregated data as JSON
  - Generates PDF with: total spend, category breakdown pie chart, top merchants, budget vs actual, Teftera logo
  - Returns PDF as binary response
- [ ] "Export" button on Insights screen calls the service, downloads PDF via `expo-sharing`
- [ ] Alternatively: generate PDF client-side with `react-native-html-to-pdf` if Cloud Run feels premature

**Checkpoint:** Tap Export on Insights. Receive a branded PDF with real data for the month.

---

### Day 17 — GoCardless DSK Live Sync (Optional Upgrade)

- [ ] Replace or supplement CSV import with GoCardless Bank Account Data API
- [ ] OAuth consent flow: user authorizes DSK → GoCardless → Teftera (90-day re-auth cycle)
- [ ] Pull last 90 days of transactions as JSON → run through same ETL normalizer as CSV import
- [ ] "Sync with DSK" button triggers a GoCardless pull, not a CSV file picker
- [ ] Graceful handling of expired consent (prompt to re-authenticate)

> **Note:** Only build this if you want the live bank connection for the portfolio. CSV import already covers the core use case.

---

### Day 18 — Final Polish & Portfolio Prep

- [ ] Error boundaries on every screen
- [ ] Network offline state (Expo NetInfo) — show a banner, disable sync actions
- [ ] Empty state illustrations on all 3 main screens
- [ ] App icon: import the anthemion logo PNG, export all sizes via appicon.co, configure in `app.json`
- [ ] Splash screen using the logo
- [ ] `README.md` complete: architecture diagram, screenshots of all screens, env var list, setup instructions
- [ ] EAS `preview` build — install on both phones via QR code (no app store needed)
- [ ] Portfolio write-up text (use the framing from earlier: receipt OCR pipeline, anomaly detection, ETL pipeline, Cloud Run, Supabase Realtime)

**Checkpoint:** App installs from EAS on both phones. README has screenshots. You can walk through the whole app in a demo without hitting any crashes or missing states.

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

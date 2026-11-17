# CLAUDE.md — Teftera

Persistent guidance for every Claude Code session. Read before making any change.

---

## Project Overview

**Teftera** (Bulgarian: "тефтера" = ledger) is an AI-powered personal finance mobile app for a shared two-person household. Personal use + portfolio project — code quality and architecture matter as much as features. Zero running cost: free tiers only. Ask before adding any paid dependency.

**Core capabilities:** shared real-time expense tracking · receipt scanning with Gemini extraction · DSK Bank Bulgaria CSV import + ETL · AI spending insights · anomaly detection.

---

## Commands

> Fill in once scaffolded. Keep this section current — it is the fastest orientation for a new session.

```bash
# install
npm install

# start dev server
npx expo start

# start with tunnel (for remote access / testing away from home network)
npx expo start --tunnel

# typecheck
npx tsc --noEmit

# lint
npm run lint

# format
npm run format

# run tests
npm test

# supabase: regenerate DB types after every applied migration (main checkout is linked)
npm run db:types

# supabase: new migration (CLI installed as a devDependency)
npx supabase migration new <name>

# supabase: push migrations to remote
npx supabase db push

# supabase: run locally
npx supabase start

# eas: build for internal testing
eas build --profile preview --platform all
```

---

## Stack

| Layer | Choice |
|---|---|
| Framework | React Native + Expo (managed workflow) |
| Language | TypeScript — strict mode, no plain `.js` files |
| Styling | NativeWind (Tailwind for RN) |
| State | Zustand |
| Forms | React Hook Form + Zod |
| Backend / DB | Supabase (Postgres + Auth + Storage + Realtime) |
| AI / LLM | Gemini Flash (`gemini-2.5-flash`) — Google AI Studio. Calls run server-side in `supabase/functions/gemini-extract` and `gemini-summary`; `services/gemini.ts` is the thin client seam. |
| Charts | Victory Native XL (Skia) |
| Camera | expo-camera + expo-image-picker |
| Blur | expo-blur BlurView |
| Fonts | expo-font + @expo-google-fonts/plus-jakarta-sans + inter |
| Icons | @expo/vector-icons (MaterialIcons) or lucide-react-native |
| Auth | Supabase Auth — email/password + Google OAuth |
| Keyboard | react-native-keyboard-controller (KeyboardProvider in root layout) |
| Barcodes | own EAN-13 / EAN-8 / Code128 encoders in `lib/barcode` + react-native-qrcode-svg, rendered with react-native-svg |
| Feedback | Reanimated presets (`lib/animation.ts`), expo-brightness (card presenter) |
| CI/CD | Expo EAS · GitHub Actions (tsc + lint + jest on PRs and main) |

**Future (not yet built):** thin FastAPI service on GCP Cloud Run for the anomaly model. (Gemini calls are already server-side — see Non-Negotiable Rules #5.) Isolate all AI and ML logic behind service modules now so the move is a one-file change later.

---

## Architecture

```
/app                     Expo Router screens
  /(auth)                sign-in, sign-up, household-setup, join-household
  /(app)                 main tab navigator
    /index               Dashboard
    /history             Transaction log
    /insights            Insights
    /profile             Profile & settings
  /scanner               Camera capture (no nav bar)
  /confirm-receipt       Gemini extraction review
  /manual-entry          Manual transaction form
  /vendors, /vendor/[id] Vendors & recognized names
  /loyalty-cards         Loyalty cards (grouped by vendor)
  /card/[id]             Full-screen barcode presenter (max brightness)
  /lists, /list/[id]     Shopping lists

/features
  /transactions          components, hooks, types
  /receipts              scanner logic, Gemini flow
  /insights              charts, AI summary
  /budgets               goals, progress
  /household             members, invite codes
  /sync                  realtime channels + createHouseholdSync (coalesced reloads)
  /vendors               normalized merchant names, aliases, autocomplete, conflict flow
  /loyalty               cards, scanner, presenter
  /shopping              lists, optimistic items (commit-clock engine), quick-add

/services
  /supabase.ts           client init — single export, used everywhere
  /gemini.ts             ALL Gemini calls go here, nowhere else
  /dsk-import.ts         CSV parsing, ETL, normalization, BGN→EUR
  /anomaly.ts            Z-score / flagging logic

/lib
  /formatCurrency.ts     canonical money formatter
  /categories.ts         category rules + icons
  /dates.ts              date helpers, bg-BG locale, month toolkit
  /theme.ts              colour tokens — single source for tailwind.config.js; use `colors.*`, never raw hex
  /barcode/              pure barcode encoders (tested)
  /animation.ts          Reanimated presets

/supabase
  /migrations            all schema changes in SQL files, versioned
  /types.ts              generated Database types (`npm run db:types`) — regenerate after each migration
```

---

## Non-Negotiable Rules

1. **Money = integers.** Store cents (euro-cent minor units). Never float arithmetic. All display goes through `formatCurrency`.
2. **No USD / no `$`.** Default currency is **EUR (€)**. BGN (лв) for legacy pre-2026 DSK imports only, converted at fixed rate **1 EUR = 1.95583 BGN**. Retain `original_amount` + `original_currency` on imported rows.
3. **`household_id` on every table.** Row Level Security on every table — a user reads/writes only their household's rows. Non-negotiable.
4. **Schema changes = migration files.** Never edit the schema only via the Supabase dashboard.
5. **No secrets in git.** `.env` is gitignored from commit 1. Gemini key never ships in the client bundle long-term — all calls go through `/services/gemini.ts` so they can move server-side in one step. **DONE:** Gemini calls now run server-side behind `supabase/functions/gemini-extract` and `supabase/functions/gemini-summary`; `services/gemini.ts` is a thin client seam that calls those edge functions (with the user's JWT) rather than the Gemini SDK directly.
6. **Gemini always has a fallback.** Wrap all JSON parsing in try/catch. A bad or empty receipt response falls back to the manual-edit screen — never crash, never block.
7. **Log Gemini calls in dev.** Build a receipt image test set as you go.
8. **Ask before adding paid deps.** Free tiers only unless explicitly agreed.
9. **The barcode presenter is the one white surface in the app.** Everything else follows the dark design tokens.
10. **Cross-table references stay in one household.** Foreign keys bypass RLS, so any new FK between household tables gets a same-household check trigger (see the vendors/loyalty/shopping migrations).

---

## Database — Core Tables

```sql
households          id, name, invite_code, created_at
household_members   id, household_id, user_id, role, joined_at
transactions        id, household_id, user_id, amount_eur (int, cents),
                    original_amount (int, nullable), original_currency (text, nullable),
                    merchant, category_id, date, note, receipt_id, is_flagged, created_at,
                    kind ('expense'|'income')
categories          id, household_id, name, icon, color, is_default, kind ('expense'|'income')
receipts            id, household_id, user_id, storage_path, raw_gemini_json,
                    processed_at, created_at
budgets             id, household_id, category_id, amount_eur (int), month, created_at
anomalies           id, household_id, transaction_id, reason, score, reviewed, created_at
vendors             id, household_id, name, name_key, created_at, updated_at
vendor_aliases      id, household_id, vendor_id, alias, alias_key, is_primary, source, created_at
loyalty_cards       id, household_id, vendor_id (nullable), nickname, code, code_format, color, note, created_by, …
shopping_lists      id, household_id, vendor_id (nullable), name, loyalty_card_id (nullable), created_by, …
shopping_list_items id, household_id, list_id, name, quantity, position, checked_at, checked_by, created_by, created_at
```

RLS policy pattern for every table:
```sql
USING (household_id IN (
  SELECT household_id FROM household_members WHERE user_id = auth.uid()
))
```

---

## Design System — Exact Tokens from Stitch Mockups

### Colors
```js
'background':                '#121316',
'surface':                   '#121316',
'surface-container-lowest':  '#0d0e11',
'surface-container-low':     '#1a1c1f',
'surface-container':         '#1e2023',
'surface-container-high':    '#292a2d',
'surface-container-highest': '#343538',
'surface-bright':            '#38393c',
'surface-variant':           '#343538',
'primary':                   '#d8e3ff',
'primary-container':         '#adc7ff',   // button fills, active nav
'on-primary':                '#112f5e',
'on-primary-container':      '#385283',
'surface-tint':              '#adc7ff',
'secondary-fixed':           '#c3f400',   // ANOMALY ACCENT ONLY
'secondary-fixed-dim':       '#abd600',
'secondary-container':       '#c3f400',
'tertiary':                  '#ffdfa7',
'on-surface':                '#e3e2e6',
'on-background':             '#e3e2e6',
'on-surface-variant':        '#c4c6d0',
'outline':                   '#8e909a',
'outline-variant':           '#44474f',
'error':                     '#ffb4ab',
'error-container':           '#93000a',
```

### Typography
```
headline-xl:        Plus Jakarta Sans, 40px, lh 1.2, ls -0.02em, fw 600
headline-lg:        Plus Jakarta Sans, 28px, lh 1.3, ls -0.01em, fw 600
headline-lg-mobile: Plus Jakarta Sans, 24px, lh 1.3,             fw 600
headline-md:        Plus Jakarta Sans, 20px, lh 1.4,             fw 500
body-lg:            Inter,             16px, lh 1.6,             fw 400
body-md:            Inter,             14px, lh 1.5,             fw 400
data-mono:          Inter,             14px, lh 1.0,             fw 600
label-md:           Inter,             12px, lh 1.0, ls 0.05em,  fw 500
```

### Spacing
`xs`=4px · `sm`=8px · `md`=16px · `lg`=24px · `xl`=40px · `xxl`=64px

### Visual Patterns
- **Flat design** — no elevated cards. Sections separated by hairline dividers: `borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.05)'`
- **Background glows** — faint radial blue glow top-right + subtle lime glow bottom-left, `position: absolute, zIndex: -1`
- **Bottom nav** — floating pill, `surface-container/70` bg, `border: rgba(255,255,255,0.1)`, `BlurView`, 4 tabs: Home · History · Insights · Profile
- **Active nav tab** — filled `primary-container` pill (icon `on-primary` + label), slightly enlarged (`scale: 1.1`), matching the transaction-log mockup and the floating Filters/Search pills
- **Floating pill buttons** — outlined ghost pills above nav bar, icon + uppercase label
- **Section labels** — uppercase, label-md, on-surface-variant at 50% opacity
- **Pill buttons** → `borderRadius: 9999` in RN StyleSheet (not the Tailwind `full` token which is only 12px)
- **Action button rows** — every action row is a `FloatingActionBar`: floating pills on non-tab screens, or `<FloatingActionBar inline … />` inside a `BottomSheet` (e.g. `ConfirmSheet`). *One* action renders **centered**; *two or more* render **side by side, content-hugging**, in listed order (the primary/confirm action is listed first, so it sits on the **left**). Never stack action pills vertically. Pass `compact` when labels are long. Don't hand-roll pill rows per screen.

---

## Screen Inventory

| Stitch File | Screen | Nav Bar |
|---|---|---|
| `dashboard_gemini_new_nav_style.html` | Dashboard | ✅ |
| `transaction_log_refined_button_height.html` | Transaction History | ✅ |
| `insights_pill_styled_controls.html` | Insights | ✅ |
| `profile_settings_pill_selectors.html` | Profile & Settings | ✅ |
| `confirm_receipt_refined_header.html` | Confirm Receipt | ✅ |
| `manual_entry.html` | Manual Entry | ❌ |
| `ocr_scanner_focused_view.html` | Scanner Camera | ❌ |
| `sign_in_cleaned_header.html` | Sign In / Sign Up | ❌ |
| `household_setup.html` | Household Setup — Create | ❌ |
| `join_household_state.html` | Household Setup — Join | ❌ |

Generate without mockups (infer from design system): transaction detail · empty states · anomaly review modal · manage categories.

> Stitch files may reference "Kinetic Precision" or "Aura Finance" in title tags — ignore these. The app name is **Teftera** everywhere.

---

## React Native Gotchas

- `backdrop-filter: blur()` → `expo-blur` `BlurView`
- Material Symbols CSS font link → `@expo/vector-icons` MaterialIcons
- Google Fonts CSS link → `expo-font` + `@expo-google-fonts/*`
- Pill buttons → `borderRadius: 9999`, not the `full` token (12px)
- Hairline dividers → `StyleSheet.hairlineWidth` with `rgba(255,255,255,0.05)`

---

## Conventions

- TypeScript strict; no `any`; no plain `.js`
- Feature-based folders (see Architecture)
- Conventional commits: `feat:` `fix:` `refactor:` `chore:` `test:` `docs:`
- Unit tests for: `formatCurrency`, BGN→EUR, DSK ETL normalization, category rules, anomaly Z-score
- `README.md` stays current: architecture diagram, env vars, setup steps, screenshots

---

## Workflow

- Small, reviewable commits over large dumps
- Ask before adding any paid service or dependency
- Update this file in the same commit when commands or conventions change

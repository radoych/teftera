# Day 18 — Final Polish & Portfolio Prep — Design

**Date:** 2026-07-07
**Status:** Approved by owner (brainstorming session, background job)
**Build plan:** `teftera-build-plan.md` → "Day 18 — Final Polish & Portfolio Prep"

## Goal

Make the app demo-clean and the repo hiring-manager-ready: crash resilience, offline
handling, branded icon/splash, the three polish fixes parked at Day 11.5, a complete
README, a portfolio write-up, and fresh EAS builds on both phones.

**Checkpoint (from the build plan):** App installs from EAS on both phones. README has
screenshots. The whole app can be demoed without crashes or missing states. This
walkthrough also covers the still-pending Day 15 on-device budget-notification check.

## Scope decisions (settled with owner)

| Decision | Choice |
|---|---|
| Day 11.5 leftover TODOs | All three included (login logo, remove Google button, auto-decimal inputs) |
| App icon production | White `assets/logo.png` anthemion composed on `#121316` via a local `sharp` script — no appicon.co |
| Empty states | Polish the existing `EmptyState` component; no illustration assets |
| Portfolio write-up | Full README rewrite **plus** separate `docs/portfolio-writeup.md` |
| Offline detection | `expo-network` (first-party) instead of `@react-native-community/netinfo` named in the build plan |

## 1. Error boundaries

Use Expo Router's built-in per-route error boundaries (`export const ErrorBoundary`).

- New shared component `components/ScreenErrorFallback.tsx`, design-system styled:
  error icon, "Нещо се обърка" headline, error message shown **in dev only**
  (`__DEV__`), and a "Опитай отново" pill wired to the boundary's `retry` prop.
  Action row via the existing `FloatingActionBar`/centered-single-action pattern.
- Exported as `ErrorBoundary` from: root `app/_layout.tsx`, `app/(app)/_layout.tsx`,
  `app/(auth)/_layout.tsx`, and each standalone screen route (`scanner`,
  `confirm-receipt`, `manual-entry`, `import-dsk`, transaction detail).
- Rationale: a single root boundary would unmount the tab navigator on any crash;
  per-layout boundaries keep navigation alive. No new dependency.

## 2. Offline state

- Dependency: `expo-network` (Expo SDK package, free). Chosen over
  `@react-native-community/netinfo`: same capability, first-party, one less native
  dep. Either requires a new dev-client/EAS build — Day 18 rebuilds anyway.
- `lib/useIsOnline.ts`: thin hook over `expo-network`'s `useNetworkState()`
  (`isConnected && isInternetReachable !== false`).
- `components/OfflineBanner.tsx`: slim banner above the tab navigator (rendered in
  `app/(app)/_layout.tsx` and on standalone screens' shells) — "Няма връзка с
  интернет", `error-container` background, `label-md`.
- Disabled-when-offline actions (button disabled + reduced opacity, no toast):
  bank sync ("Синхронизирай с ДСК" / re-auth), CSV import confirm, receipt
  extraction trigger, manual-entry save, confirm-receipt save, PDF export.
- Supabase Realtime reconnects on its own; no extra handling.

## 3. Empty states (polish, no art)

Upgrade `components/EmptyState.tsx` in place: larger icon treatment with a faint
radial glow accent (matches the background-glow pattern), per-screen Bulgarian copy,
optional call-to-action pill.

- Dashboard: CTA → "Добави транзакция" (routes to manual entry).
- History: CTA → "Добави транзакция"; secondary hint mentions ДСК import.
- Insights: explanatory copy only (fills up as data arrives), no CTA.

One component + three existing call sites; no new assets.

## 4. App icon & splash

- `scripts/generate-app-icons.mjs` using `sharp` (free devDependency), composing from
  `assets/logo.png` (white anthemion, transparent, 2146×1808):
  - `assets/images/icon.png` — 1024×1024, logo ~60% width centered on `#121316`.
  - `assets/images/android-icon-foreground.png` — logo inside the adaptive-icon safe
    zone on transparent; background color stays `#121316` in `app.json`.
  - `assets/images/android-icon-monochrome.png` — white logo, transparent.
  - `assets/images/splash-icon.png` — logo on transparent (splash `backgroundColor`
    `#121316`, `imageWidth: 120` already configured).
  - `assets/images/favicon.png` — 48×48.
- `app.json` already points at these paths — regenerating the files in place means
  minimal config change (verify `android-icon-background.png` reference, remove if
  unused).
- Delete stock Expo template images no longer referenced (`react-logo*`,
  `expo-badge*`, `expo-logo`, `tutorial-web`, `logo-glow` if unreferenced) and the
  `assets/expo.icon/` composer bundle.
- Script is committed so icons are reproducible; it runs on demand
  (`node scripts/generate-app-icons.mjs`), not in any build pipeline.

## 5. Day 11.5 leftover polish fixes

1. **Login logo:** `app/(auth)/sign-in.tsx` (and sign-up if it shows the logo) switch
   from `assets/1781690652688.png` (opaque cream background — the "broken" render) to
   transparent `assets/logo.png`.
2. **Remove Google button:** drop the disabled Google pressable from sign-in and
   sign-up; delete `components/GoogleGlyph.tsx` if nothing else imports it. The
   segmented bottom pill keeps Регистрация / Вход only.
3. **Auto-decimal amount inputs:** shared cents-based entry — typing digits fills
   cents from the right (`1234` → `12,34`); backspace removes the last digit.
   - `lib/useCentsInput.ts`: pure formatter (`digitsToDisplay`, `displayToCents`) +
     hook. Formatter unit-tested (empty, `5` → `0,05`, leading zeros, max length,
     backspace sequence).
   - Wired into: manual-entry total, confirm-receipt total, confirm-receipt line-item
     amounts. Existing Zod validation and integer-cents storage unchanged — this is
     an input-UX layer only.

## 6. Repo hygiene (portfolio repos get read)

- `.gitignore` additions for personal data currently untracked in `assets/`:
  the two DSK CSV exports (filenames contain the owner's real IBAN), personal
  photos (`20260625_130254.jpg`), `assets/illustrator files/`, and stray duplicates
  (`1781690652688 - Copy.png` — delete).
- Delete `problems/` and `services/user.ts` from the working tree: they are fixtures
  from the skills-TDD exercise (commit `a77051e`), not app code; `services/user.ts`
  imports a `lib/http` module the app doesn't have.
- Keep `assets/1781690652688.png` only if still referenced after the logo swap;
  otherwise delete.

## 7. README, write-up, builds

### README (full rewrite)

Hero (name, one-liner, badges optional) · feature list · architecture diagram
(Mermaid: app → Supabase (Postgres/RLS/Realtime/Storage/Edge Functions) → Gemini /
Enable Banking) · stack table · env var table (`EXPO_PUBLIC_SUPABASE_URL`,
`EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_GEMINI_API_KEY`, Edge Function secrets
listed by name only) · setup steps (install, `.env`, migrations, dev client) ·
screenshots section as a placeholder grid the owner fills from the device
(**human step**).

### Portfolio write-up — `docs/portfolio-writeup.md`

Hiring-manager framing, ready to adapt for LinkedIn/CV: receipt OCR pipeline
(Gemini structured extraction with fallback), anomaly detection (Z-score), DSK CSV
ETL + dedup, live PSD2 bank sync (Enable Banking, JWT-signed requests in Supabase
Edge Functions), Supabase Realtime shared household, EUR-transition currency
handling (integer cents, fixed BGN rate), zero-cost infra.

### EAS builds (human checkpoints)

- Android: `eas build --platform android --profile preview` rebuild with new
  branding (bump `version` to `1.0.1`).
- iOS: first `eas build --platform ios --profile preview` (interactive Apple ID
  login + 2FA), then AltStore Classic sideload per the Day 11.5 notes.
- Claude prepares config; the owner runs the interactive build commands and installs.

## Execution order

1. Repo hygiene (safe, unblocks clean diffs)
2. Day 11.5 fixes + empty states + error boundaries + offline (code polish)
3. Icon/splash generation + `app.json`
4. README + portfolio write-up
5. EAS builds + on-device demo walkthrough (human)

## Testing

- New unit tests: cents-input formatter.
- Existing suite, `npx tsc --noEmit`, `npm run lint` stay green.
- Human: full demo walkthrough on-device (checkpoint), including the Day 15 budget
  notification check.

## Out of scope

Victory Native XL charts (still deferred) · Cloud Run/FastAPI · `expo-updates` OTA ·
Telegram alerts · production DSK consent (externally blocked) · forgotten-password
flow · Google OAuth.

# Teftera · тефтера

AI-powered personal finance app for a shared two-person household. Built with
React Native + Expo, TypeScript (strict), NativeWind, and Supabase.

> Status: **Steps 1–2 complete** — scaffold + all 10 screens converted from the
> Stitch mockups, static (no live data yet). Supabase, auth, and the first live
> data slice come next (Steps 3–5).

---

## Run it

```bash
npm install            # install dependencies
npx expo start         # start the dev server (press a / i / w for android / ios / web)
npx expo start --tunnel  # for testing on a device off your network
```

Then scan the QR code with **Expo Go**, or press `a`/`i` for an emulator.

### Other scripts

```bash
npm run typecheck      # tsc --noEmit (strict)
npm test               # jest unit tests
npm run lint           # expo lint
npm run format         # prettier --write
```

### Environment

Copy `.env.example` to `.env` and fill in the keys (all gitignored):

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_GEMINI_API_KEY=
```

The app boots and is fully navigable without these set (screens are static until
Step 5); Supabase/Gemini calls are no-ops or fall back until configured.

---

## Architecture

```
/app                       Expo Router screens (root-level, file-based routing)
  /(auth)                  sign-in · sign-up · household-setup · join-household
  /(app)                   tab navigator (custom floating pill nav)
    index · history · insights · profile
  scanner · confirm-receipt · manual-entry   (modal / fullscreen routes)
/components                shared UI (BottomNav, PillButton, Screen, glow, etc.)
/features                  feature modules (transactions, household, …)
/services                  supabase · gemini (LLM chokepoint) · dsk-import · anomaly
/lib                       formatCurrency · categories · dates
/supabase/migrations       SQL schema (added in Step 3)
```

### Conventions

- TypeScript strict, no `any`, no `.js` source files.
- **Money is integer euro-cents.** All display goes through `lib/formatCurrency.ts`.
  Default currency EUR; BGN is legacy (pre-2026 DSK imports) at fixed 1.95583.
- All Gemini calls go through `services/gemini.ts` only (isolated for a future
  server-side move). JSON parsing is always wrapped → falls back to manual entry.
- Design tokens (colors, type, spacing) live in `tailwind.config.js`, taken
  verbatim from the spec. The anomaly accent `#c3f400` is used only on flagged
  transactions.

### Tested logic (`npm test`)

`formatCurrency` · BGN→EUR conversion · DSK normalization · category rules ·
anomaly Z-scoring.

---

## Stack

Expo SDK 56 (RN 0.85 / React 19) · Expo Router · NativeWind v4 · Zustand ·
React Hook Form + Zod · Supabase · Gemini 2.0 Flash · expo-camera · expo-blur ·
react-native-svg · Plus Jakarta Sans + Inter.

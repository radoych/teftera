# Teftera — portfolio write-up

*Source narrative for LinkedIn posts, CV bullets, and interview walkthroughs.*

## What it is

Teftera (Bulgarian for "the ledger") is a React Native app my household actually
uses every day: a shared two-person expense tracker with receipt scanning, live
bank sync, and AI insights. I built it in 18 planned build-days as both a daily
driver and a portfolio piece, with two hard constraints: production code quality
(strict TypeScript, tests, RLS everywhere) and **zero running cost** — Supabase
free tier, Gemini free tier, Expo EAS free builds.

The timing gave it a distinctive problem to solve: Bulgaria adopted the euro in
January 2026, so the app had to handle a currency transition — historical bank
data in BGN, everything new in EUR — correctly and permanently.

## Technical highlights

### 1. Receipt OCR pipeline (Gemini)

Camera capture → image upload to Supabase Storage → Gemini structured JSON
extraction (merchant, total, date, line items) → an editable confirm screen.
The design rule that shaped it: **the model is never load-bearing.** Every
response is schema-validated; a bad, empty, or overloaded response degrades to
the same manual-entry form the user already knows. The extraction prompt, model
choice, and retry policy live behind one `services/gemini.ts` seam, sized to move
server-side (Cloud Run) as a one-file change.

### 2. Live PSD2 bank sync (first server-side code)

Supplementing CSV imports, the app connects directly to DSK Bank through Enable
Banking's PSD2 aggregation: an OAuth consent flow with a signed `state` handoff
through the browser redirect, then 90-day transaction pulls. The signing key
never touches the client — three Supabase Edge Functions
(`bank-sync-start/-callback/-transactions`) hold it as secrets and do the
JWT-signed requests. The sandbox flow is verified end-to-end on device;
production is one secrets swap away (blocked only on the bank issuing a signing
method). A fun production detail: Windows CLI truncates multiline secrets, so the
PEM key ships base64-encoded and the function decodes both forms.

### 3. One ETL pipeline, two feeds

DSK CSV exports and the Enable Banking JSON feed normalize into the same
pipeline: parse → normalize (dates, merchants, amounts) → fixed-rate BGN→EUR
conversion with `original_amount`/`original_currency` retained → merchant-rule
auto-categorization → dedup against existing rows → preview screen → bulk
insert. Re-importing an overlapping statement is idempotent by construction, and
the dedup logic is unit-tested against recorded fixtures from both feeds.

### 4. Anomaly detection that explains itself

After every save, a per-category Z-score over the household's history flags
outliers (|Z| > 2.5) into an `anomalies` table with a human-readable reason;
flagged rows get a deliberate lime accent reserved for exactly this. I chose an
explainable statistical detector over an ML model on purpose: with a two-person
dataset, "3× your usual for Groceries" beats a black box, and the whole engine
is a pure, unit-tested function.

### 5. Money as integers, sharing via RLS

There is no floating-point money anywhere: amounts are integer euro-cents,
formatted by a single `formatCurrency`, parsed by a single validated path. Data
sharing is enforced in the database, not the client — every table carries
`household_id` and a Postgres Row Level Security policy, so a user can only ever
read or write their household's rows. Realtime subscriptions ride the same
policies, which is how two phones stay in sync without any sync code of my own.

## Architecture & cost

Expo (React Native, strict TypeScript, Expo Router) → Supabase (Postgres + Auth
+ Storage + Realtime + Edge Functions) → Gemini for extraction and monthly
natural-language summaries. Victory-chart-free insights (proportional views),
on-device PDF report via `expo-print`, EAS internal distribution to both phones.
Running cost: **€0/month**. The AI and anomaly seams are shaped for a planned
FastAPI microservice on Cloud Run when server-side inference becomes worth it.

## Process

Every feature went spec → implementation plan → TDD on the pure core → small
conventional commits; the specs and plans are committed in
`docs/superpowers/`. Unit tests concentrate where they pay rent: currency math,
ETL normalization, dedup, category rules, Z-scores, report data. UI is verified
on device against a fixed design system extracted from the Stitch mockups.

## One-liners (for a CV)

- Built a production-quality shared-household finance app (React Native/Expo,
  Supabase, Gemini) used daily by its two users at €0/month infra cost.
- Implemented a PSD2 open-banking integration with JWT-signed requests from
  Supabase Edge Functions, keeping signing keys fully server-side.
- Designed a currency-transition-safe money model (integer cents, fixed-rate
  BGN→EUR with source-amount retention) for Bulgaria's 2026 euro adoption.
- Shipped a fault-tolerant LLM extraction pipeline where any model failure
  degrades gracefully to manual entry — zero crash paths.

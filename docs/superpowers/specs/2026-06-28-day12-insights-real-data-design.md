# Day 12 — Insights Screen: Real Data

**Date:** 2026-06-28
**Status:** Approved design, ready for implementation plan
**Build plan:** Day 12 (Phase 5 — Intelligence)

---

## Goal

Replace the fully static Insights screen with real, household-scoped aggregations:
a range-filtered hero total, category breakdown, a fixed 6-month trend, and top
merchants — plus time-range pills, a person/household toggle, and loading skeletons.
The AI-summary and Anomalies sections stay as static placeholders until their own days.

## Context — current state

- `app/(app)/insights.tsx` is fully static: hardcoded `CATEGORIES`, `TREND`, `MERCHANTS`,
  `ANOMALIES`, and hero total, shown whenever `transactions.length > 0`; a real
  `EmptyState` shows otherwise. A placeholder `FloatingActionBar` renders "Филтри" /
  "Сравни" pills that do nothing.
- Day 7 already built pure, unit-tested helpers in `features/transactions/dashboard.ts`:
  `dayTotalCents`, `prevMonthTotalCents`, `pctChange`, `filterByUser`, and
  `spendingByCategory` (current-month group → sort → `fraction`). `CategorySpend` type
  lives there.
- `useTransactionsStore` exposes `transactions`, `categories`, `loading`, `loaded`.
- `useAuthStore` provides the current user (`session.user.id`) and household context; the
  Day 7 dashboard already implements a person/household `SegmentedToggle` to mirror.
- Money is integer EUR cents; all display via `formatCurrency`. UI copy is Bulgarian.

## Locked decisions

1. **Proportional Views, no chart library.** The 6-month trend and category bars render
   with plain Views (consistent with Day 7 and the `charts-deferred` note). Victory Native
   XL / Skia is NOT installed — avoids unverified RN 0.85 / New-Arch / React 19 compat and
   keeps the EAS native builds simple.
2. **Range pills scope hero total + category breakdown + top merchants.** The **monthly
   trend stays a fixed last-6-months view**, independent of the selected pill.
3. **AI-summary and Anomalies sections stay as static placeholders** (untouched JSX),
   wired to real data later in Day 14 (AI summary) and Day 13 (anomalies).
4. **The placeholder floating "Филтри / Сравни" bar is removed.** Filtering moves to
   inline controls; a "Compare" feature is not a Day 12 deliverable (YAGNI).
5. **Top-merchant rows use a generic `store` icon** — real merchants have no icons.

## Controls

Inline, under the "Анализи" title:

- **Time-range pill row** (horizontal): `Този месец` · `Миналия месец` · `3 месеца` ·
  `Година`. Active pill = filled `primary-container` (design-system active pill). Default:
  `Този месец`.
- **Person/household `SegmentedToggle`** (`Аз` / `Домакинство`), reusing the Day 7
  dashboard pattern: `Аз` → `filterByUser(txs, session.user.id)`, `Домакинство` →
  `filterByUser(txs, null)`.

## Render states

- `loading && !loaded` → **skeleton** placeholders for the data sections.
- `loaded && transactions.length === 0` → existing **`EmptyState`** (`icon="insights"`).
- otherwise → real data.

## Sections wired to real data

1. **Hero total** — `sumCents` of the person- and range-filtered transactions, formatted
   via `formatCurrency`. Below it, a `▲/▼ X%` delta from `pctChange(currentTotal,
   comparisonTotal)` where the comparison total is the same person scope over
   `comparisonRange(range)` (the immediately preceding equal-length window). The delta line
   is hidden when `pctChange` returns `null` (no baseline). Label: month-length ranges read
   "спрямо миналия месец", others "спрямо предходния период". The delta's visual
   treatment (arrow + colour) **matches the Day 7 dashboard's month-comparison delta** for
   consistency — do not introduce the lime `secondary-fixed` family here (CLAUDE.md reserves
   it for the anomaly accent).
2. **Category breakdown** — `categoryBreakdown(rangeFilteredTxs, categories)`: grouped,
   sorted high→low, proportional bars (existing visual). Unknown/null category → "Other".
3. **Monthly trend** — `monthlyTrend(personFilteredTxs, 6, now)`: the last 6 calendar
   months (range pill ignored), real totals, `fraction` relative to the tallest bar,
   current month highlighted (`primary` accent), BG month abbreviations. Honors the person
   toggle, not the range pill.
4. **Top merchants** — `topMerchants(rangeFilteredTxs, 5)`: grouped by `merchant`, summed,
   sorted desc, top 5. Each row renders a generic `store` MaterialIcon + merchant +
   `formatCurrency(totalCents)`.
5. **AI summary + Anomalies** — unchanged static JSX (placeholders).

## Architecture & files

**Refactor (DRY, keeps Day 7 green):**
- `features/transactions/dashboard.ts` — extract the group→sort→fraction core of
  `spendingByCategory` into a shared, date-filter-free
  `categoryBreakdown(txs: Transaction[], categories: CategoryLite[]): CategorySpend[]`.
  `spendingByCategory` becomes a thin wrapper: filter to the current month, then call
  `categoryBreakdown`. `CategorySpend` stays exported from here.

**New pure modules** (`features/insights/`, per the CLAUDE.md architecture map):
- `features/insights/range.ts`
  - `export type TimeRange = 'this_month' | 'last_month' | 'last_3_months' | 'year';`
  - `filterByRange(txs: Transaction[], range: TimeRange, now?: Date): Transaction[]` —
    inclusive date-window filter on `tx.date` (YYYY-MM-DD).
  - `comparisonRange(range: TimeRange, now?: Date): { startISO: string; endISO: string }` —
    bounds of the immediately preceding equal-length window.
  - `filterByDateBounds(txs, startISO, endISO): Transaction[]` — shared inclusive filter
    used by both functions.
- `features/insights/aggregate.ts`
  - `sumCents(txs: Transaction[]): number`
  - `interface TrendMonth { label: string; totalCents: number; fraction: number; isCurrent: boolean }`
  - `monthlyTrend(txs: Transaction[], monthsBack?: number, now?: Date): TrendMonth[]` —
    `monthsBack` defaults to 6; oldest→newest; `fraction` is each bar over the tallest
    (0 when all zero); `isCurrent` true for `now`'s month.
  - `interface MerchantSpend { merchant: string; totalCents: number }`
  - `topMerchants(txs: Transaction[], n?: number): MerchantSpend[]` — `n` defaults to 5;
    group by exact `merchant`, sum, sort by `totalCents` desc with ties broken by
    `merchant` ascending (deterministic), slice top `n`.

**Supporting:**
- `lib/dates.ts` — add BG month abbreviations (`['ЯНУ','ФЕВ','МАР','АПР','МАЙ','ЮНИ',
  'ЮЛИ','АВГ','СЕП','ОКТ','НОЕ','ДЕК']`) + a small accessor if not already present;
  `monthlyTrend` uses it for labels.
- `components/Skeleton.tsx` — a minimal placeholder block (rounded `surface-container-high`
  View, fixed/!-passed height; no shimmer dependency). Reused for the loading state. If an
  equivalent primitive already exists, reuse it instead of adding one.

**Screen:**
- `app/(app)/insights.tsx` — local state: `range: TimeRange` (default `this_month`) and the
  person scope. Derives every section from `useTransactionsStore` + `useAuthStore` via the
  helpers above. Renders skeleton / empty / real. The static AI-summary and Anomalies JSX
  blocks are preserved verbatim. The placeholder `FloatingActionBar` is removed.

## Data flow (per render)

```
store.transactions
  ├─ filterByUser(personScope)
  │    ├─ filterByRange(range)
  │    │    ├─ sumCents .............. hero total
  │    │    ├─ categoryBreakdown ..... category bars
  │    │    └─ topMerchants .......... merchant list
  │    └─ monthlyTrend(6) ............ trend bars (range ignored)
  └─ filterByUser(personScope) + comparisonRange(range) → sumCents → pctChange → hero % delta
```

## Testing (TDD)

Pure helpers are unit-tested; the screen is UI (no render test, per project convention —
all logic lives in tested helpers).

- `features/insights/range.test.ts`: `filterByRange` for all four ranges including
  boundary dates (first/last day of month, 3-month window start, year rollover across
  Dec→Jan); `comparisonRange` window correctness for each range.
- `features/insights/aggregate.test.ts`: `monthlyTrend` → exactly `monthsBack` buckets,
  correct BG labels and order, `fraction` relative to the tallest, `isCurrent` flag,
  all-zero (no NaN) case; `topMerchants` → grouping by merchant, desc sort, top-`n` cutoff,
  tie broken by merchant ascending; `sumCents` basic + empty.
- `features/transactions/dashboard.test.ts`: add direct `categoryBreakdown` tests; confirm
  existing `spendingByCategory` tests stay green after the extraction.

## Out of scope

AI summary (Day 14), anomalies wiring (Day 13), Victory/Skia charts, a Compare feature,
per-merchant icons, and any change to the dashboard screen beyond the `categoryBreakdown`
extraction.

## Checkpoint

Insights screen shows real totals, category breakdown, a 6-month trend, and top merchants.
The range pills re-scope the hero/category/merchant sections; the person toggle switches
between your spend and the household's; the trend always shows the last 6 months. Loading
shows skeletons; a fresh household shows the empty state.

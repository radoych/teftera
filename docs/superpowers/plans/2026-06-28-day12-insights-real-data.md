# Day 12 — Insights Screen: Real Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static Insights screen with real, household-scoped aggregations — a range-filtered hero total, category breakdown, fixed 6-month trend, and top merchants — plus time-range pills, a person/household toggle, and loading skeletons.

**Architecture:** Pure aggregation helpers live in `features/insights/` (`range.ts`, `aggregate.ts`), unit-tested in isolation; the existing `spendingByCategory` is refactored to expose a shared date-filter-free `categoryBreakdown`. The screen composes these with reused UI (`SegmentedToggle`, a shared-extracted `Comparison`, a new `Skeleton`). No chart library — bars are proportional Views.

**Tech Stack:** React Native + Expo, TypeScript strict, NativeWind, Zustand, Jest (`jest-expo`).

## Global Constraints

- **Money = integer EUR cents.** Never float arithmetic; all display via `formatCurrency`.
- **No chart library.** Trend + category bars are proportional Views. Do NOT install Victory Native XL / `@shopify/react-native-skia`.
- **Range pills scope hero + category + top merchants; the monthly trend stays a fixed last-6-months view** (range pill ignored; person toggle still applies).
- **AI-summary and Anomalies sections stay as static placeholder JSX** (untouched — Days 14/13).
- **Lime `secondary-fixed` is the anomaly accent only.** The hero delta reuses the shared `Comparison` component (same treatment as the Day 7 dashboard).
- **UI copy is Bulgarian.** TypeScript strict; no `any`; no plain `.js`.
- **Conventional commits**; every commit ends with the trailer below.
- Verification commands: `npm test`, `npx tsc --noEmit`, `npm run lint`. The `env: load .env` header line printed by lint/test is normal, not an error.

Commit trailer for every commit:
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## File Structure

- `lib/dates.ts` — **modify**: add `MONTH_ABBR_BG` + `monthAbbr(monthIndex)`.
- `lib/dates.test.ts` — **modify**: tests for `monthAbbr`.
- `features/transactions/dashboard.ts` — **modify**: extract `categoryBreakdown`; `spendingByCategory` becomes a thin current-month wrapper.
- `features/transactions/dashboard.test.ts` — **modify**: add `categoryBreakdown` tests.
- `features/insights/range.ts` — **create**: `TimeRange`, `rangeBounds`, `comparisonRange`, `filterByDateBounds`, `filterByRange`.
- `features/insights/range.test.ts` — **create**.
- `features/insights/aggregate.ts` — **create**: `sumCents`, `monthlyTrend`, `topMerchants`.
- `features/insights/aggregate.test.ts` — **create**.
- `components/Comparison.tsx` — **create**: extracted from `app/(app)/index.tsx`.
- `components/Skeleton.tsx` — **create**.
- `app/(app)/index.tsx` — **modify**: import the shared `Comparison` (remove the local copy).
- `app/(app)/insights.tsx` — **modify**: wire real data.
- `teftera-build-plan.md` — **modify**: check off Day 12.

---

## Task 1: BG month abbreviations (`monthAbbr`)

**Files:**
- Modify: `lib/dates.ts`
- Test: `lib/dates.test.ts`

**Interfaces:**
- Produces: `MONTH_ABBR_BG: readonly string[]` and `monthAbbr(monthIndex: number): string` — BG 3-letter month abbreviation for a 0-based month index, wrapping via modulo 12.

- [ ] **Step 1: Write the failing test**

Append to `lib/dates.test.ts`:
```ts
import { monthAbbr } from './dates';

describe('monthAbbr', () => {
  it('maps 0 → ЯНУ and 11 → ДЕК', () => {
    expect(monthAbbr(0)).toBe('ЯНУ');
    expect(monthAbbr(11)).toBe('ДЕК');
  });
  it('wraps out-of-range indices', () => {
    expect(monthAbbr(12)).toBe('ЯНУ');
    expect(monthAbbr(-1)).toBe('ДЕК');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/dates.test.ts -t monthAbbr`
Expected: FAIL — `monthAbbr is not a function`.

- [ ] **Step 3: Implement**

Append to `lib/dates.ts`:
```ts
/** Bulgarian 3-letter month abbreviations; index 0 = January. */
export const MONTH_ABBR_BG = [
  'ЯНУ', 'ФЕВ', 'МАР', 'АПР', 'МАЙ', 'ЮНИ',
  'ЮЛИ', 'АВГ', 'СЕП', 'ОКТ', 'НОЕ', 'ДЕК',
] as const;

/** BG 3-letter abbreviation for a 0-based month index (wraps via modulo 12). */
export function monthAbbr(monthIndex: number): string {
  return MONTH_ABBR_BG[((monthIndex % 12) + 12) % 12]!;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest lib/dates.test.ts -t monthAbbr`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dates.ts lib/dates.test.ts
git commit -m "$(cat <<'EOF'
feat(dates): BG month abbreviations helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extract `categoryBreakdown` (DRY refactor)

**Files:**
- Modify: `features/transactions/dashboard.ts`
- Test: `features/transactions/dashboard.test.ts`

**Interfaces:**
- Produces: `categoryBreakdown(txs: Transaction[], categories: CategoryLite[]): CategorySpend[]` — groups the given (already date-filtered) transactions by category, sorts high→low, sets `fraction` relative to the largest bucket; unknown/null category → an "Other" row (`id: 'uncategorized'`).
- `spendingByCategory(txs, categories, now?)` keeps its current behavior (current-month wrapper).

- [ ] **Step 1: Write the failing test**

Append to `features/transactions/dashboard.test.ts` (the file already defines `tx()` and `cats`):
```ts
import { categoryBreakdown } from './dashboard';

describe('categoryBreakdown', () => {
  it('groups, sums and sorts the given txs without any date filter', () => {
    const rows = categoryBreakdown(
      [
        tx({ id: '1', category_id: 'c1', date: '2026-05-31', amount_eur: 1000 }),
        tx({ id: '2', category_id: 'c2', date: '2026-06-05', amount_eur: 3000 }),
        tx({ id: '3', category_id: 'c1', date: '2026-01-01', amount_eur: 1000 }),
      ],
      cats,
    );
    expect(rows.map((r) => [r.id, r.totalCents])).toEqual([
      ['c2', 3000],
      ['c1', 2000],
    ]);
    expect(rows[0]!.fraction).toBe(1);
    expect(rows[1]!.fraction).toBeCloseTo(2 / 3);
  });

  it('buckets null/unknown categories into Other', () => {
    const rows = categoryBreakdown(
      [tx({ id: '1', category_id: null, amount_eur: 300 }), tx({ id: '2', category_id: 'gone', amount_eur: 200 })],
      cats,
    );
    expect(rows).toHaveLength(1);
    expect([rows[0]!.id, rows[0]!.name, rows[0]!.totalCents]).toEqual(['uncategorized', 'Other', 500]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest features/transactions/dashboard.test.ts -t categoryBreakdown`
Expected: FAIL — `categoryBreakdown is not a function`.

- [ ] **Step 3: Refactor `dashboard.ts`**

Replace the existing `spendingByCategory` function (the block from its doc-comment through its closing brace) with:
```ts
/**
 * Group → sort → fraction for an already-filtered set of transactions.
 * Unknown/null category → an "Other" row. `fraction` is relative to the
 * largest bucket. This is the shared core used by the dashboard and insights.
 */
export function categoryBreakdown(
  txs: Transaction[],
  categories: CategoryLite[],
): CategorySpend[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string, number>();

  for (const tx of txs) {
    const cat = tx.category_id ? byId.get(tx.category_id) : undefined;
    const key = cat ? cat.id : FALLBACK_ID;
    totals.set(key, (totals.get(key) ?? 0) + tx.amount_eur);
  }

  const rows: CategorySpend[] = [...totals.entries()].map(([id, totalCents]) => {
    const cat = byId.get(id);
    return {
      id,
      name: cat?.name ?? FALLBACK_NAME,
      icon: (cat?.icon as MaterialIconName) ?? FALLBACK_ICON,
      color: cat?.color ?? FALLBACK_COLOR,
      totalCents,
      fraction: 0,
    };
  });

  rows.sort((a, b) => b.totalCents - a.totalCents);
  const max = rows[0]?.totalCents ?? 0;
  if (max > 0) for (const row of rows) row.fraction = row.totalCents / max;
  return rows;
}

/** Current-month spend grouped by category, sorted high to low. Unknown/null → "Other". */
export function spendingByCategory(
  txs: Transaction[],
  categories: CategoryLite[],
  now: Date = new Date(),
): CategorySpend[] {
  const prefix = monthPrefix(now.getFullYear(), now.getMonth());
  return categoryBreakdown(
    txs.filter((tx) => tx.date.startsWith(prefix)),
    categories,
  );
}
```
Leave `monthPrefix`, the `FALLBACK_*` constants, and the `CategorySpend` interface as they are.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest features/transactions/dashboard.test.ts`
Expected: PASS — the new `categoryBreakdown` tests AND the existing `spendingByCategory` tests are green (behavior unchanged).

- [ ] **Step 5: Commit**

```bash
git add features/transactions/dashboard.ts features/transactions/dashboard.test.ts
git commit -m "$(cat <<'EOF'
refactor(dashboard): extract shared categoryBreakdown core

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Time-range helpers (`features/insights/range.ts`)

**Files:**
- Create: `features/insights/range.ts`
- Test: `features/insights/range.test.ts`

**Interfaces:**
- Consumes: `toISODate` from `@/lib/dates`; `Transaction` from `@/features/transactions/types`.
- Produces:
  - `type TimeRange = 'this_month' | 'last_month' | 'last_3_months' | 'year'`
  - `interface DateBounds { startISO: string; endISO: string }`
  - `rangeBounds(range, now?): DateBounds` — inclusive calendar-month-aligned window.
  - `comparisonRange(range, now?): DateBounds` — the immediately preceding equal-length window.
  - `filterByDateBounds(txs, startISO, endISO): Transaction[]` — inclusive on both ends.
  - `filterByRange(txs, range, now?): Transaction[]`.

- [ ] **Step 1: Write the failing test**

Create `features/insights/range.test.ts`:
```ts
import type { Transaction } from '@/features/transactions/types';
import { comparisonRange, filterByDateBounds, filterByRange, rangeBounds } from './range';

const NOW = new Date(2026, 5, 15); // 15 Jun 2026

function tx(date: string): Transaction {
  return {
    id: date, household_id: 'h', user_id: 'u', amount_eur: 100,
    original_amount: null, original_currency: null, merchant: 'M',
    category_id: null, date, note: null, source: 'manual',
    receipt_id: null, is_flagged: false, occurred_at: null,
    created_at: `${date}T00:00:00.000Z`,
  };
}

describe('rangeBounds', () => {
  it('this_month → the full current calendar month', () => {
    expect(rangeBounds('this_month', NOW)).toEqual({ startISO: '2026-06-01', endISO: '2026-06-30' });
  });
  it('last_month → the previous calendar month', () => {
    expect(rangeBounds('last_month', NOW)).toEqual({ startISO: '2026-05-01', endISO: '2026-05-31' });
  });
  it('last_3_months → current plus the two preceding months', () => {
    expect(rangeBounds('last_3_months', NOW)).toEqual({ startISO: '2026-04-01', endISO: '2026-06-30' });
  });
  it('year → the trailing 12 calendar months', () => {
    expect(rangeBounds('year', NOW)).toEqual({ startISO: '2025-07-01', endISO: '2026-06-30' });
  });
});

describe('comparisonRange', () => {
  it('this_month → the month before', () => {
    expect(comparisonRange('this_month', NOW)).toEqual({ startISO: '2026-05-01', endISO: '2026-05-31' });
  });
  it('last_3_months → the three months before the window', () => {
    expect(comparisonRange('last_3_months', NOW)).toEqual({ startISO: '2026-01-01', endISO: '2026-03-31' });
  });
  it('year → the twelve months before the window', () => {
    expect(comparisonRange('year', NOW)).toEqual({ startISO: '2024-07-01', endISO: '2025-06-30' });
  });
});

describe('filterByRange / filterByDateBounds', () => {
  it('filterByRange keeps only dates inside the inclusive window', () => {
    const txs = [tx('2026-06-01'), tx('2026-06-30'), tx('2026-05-31'), tx('2026-07-01')];
    expect(filterByRange(txs, 'this_month', NOW).map((t) => t.date)).toEqual(['2026-06-01', '2026-06-30']);
  });
  it('filterByDateBounds is inclusive on both ends', () => {
    const txs = [tx('2026-03-31'), tx('2026-04-01'), tx('2026-06-30'), tx('2026-07-01')];
    expect(filterByDateBounds(txs, '2026-04-01', '2026-06-30').map((t) => t.date)).toEqual([
      '2026-04-01',
      '2026-06-30',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest features/insights/range.test.ts`
Expected: FAIL — cannot find module `./range`.

- [ ] **Step 3: Implement**

Create `features/insights/range.ts`:
```ts
import { toISODate } from '@/lib/dates';
import type { Transaction } from '@/features/transactions/types';

export type TimeRange = 'this_month' | 'last_month' | 'last_3_months' | 'year';

export interface DateBounds {
  startISO: string; // inclusive YYYY-MM-DD
  endISO: string; // inclusive YYYY-MM-DD
}

function bounds(start: Date, end: Date): DateBounds {
  return { startISO: toISODate(start), endISO: toISODate(end) };
}

/** Inclusive [start, end] window for a range, aligned to calendar-month edges. */
export function rangeBounds(range: TimeRange, now: Date = new Date()): DateBounds {
  const y = now.getFullYear();
  const m = now.getMonth();
  const lastOfThisMonth = new Date(y, m + 1, 0); // day 0 = last day of month m
  switch (range) {
    case 'this_month':
      return bounds(new Date(y, m, 1), lastOfThisMonth);
    case 'last_month':
      return bounds(new Date(y, m - 1, 1), new Date(y, m, 0));
    case 'last_3_months':
      return bounds(new Date(y, m - 2, 1), lastOfThisMonth);
    case 'year':
      return bounds(new Date(y, m - 11, 1), lastOfThisMonth);
  }
}

/** Inclusive window immediately preceding `range`, of equal length. */
export function comparisonRange(range: TimeRange, now: Date = new Date()): DateBounds {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (range) {
    case 'this_month':
      return bounds(new Date(y, m - 1, 1), new Date(y, m, 0));
    case 'last_month':
      return bounds(new Date(y, m - 2, 1), new Date(y, m - 1, 0));
    case 'last_3_months':
      return bounds(new Date(y, m - 5, 1), new Date(y, m - 2, 0));
    case 'year':
      return bounds(new Date(y, m - 23, 1), new Date(y, m - 11, 0));
  }
}

/** Transactions whose `date` falls within [startISO, endISO] inclusive. */
export function filterByDateBounds(
  txs: Transaction[],
  startISO: string,
  endISO: string,
): Transaction[] {
  return txs.filter((tx) => tx.date >= startISO && tx.date <= endISO);
}

/** Transactions within the given range window. */
export function filterByRange(
  txs: Transaction[],
  range: TimeRange,
  now: Date = new Date(),
): Transaction[] {
  const { startISO, endISO } = rangeBounds(range, now);
  return filterByDateBounds(txs, startISO, endISO);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest features/insights/range.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add features/insights/range.ts features/insights/range.test.ts
git commit -m "$(cat <<'EOF'
feat(insights): time-range + comparison window helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Aggregation helpers (`features/insights/aggregate.ts`)

**Files:**
- Create: `features/insights/aggregate.ts`
- Test: `features/insights/aggregate.test.ts`

**Interfaces:**
- Consumes: `monthAbbr` from `@/lib/dates`; `Transaction` from `@/features/transactions/types`.
- Produces:
  - `sumCents(txs): number`
  - `interface TrendMonth { label: string; totalCents: number; fraction: number; isCurrent: boolean }`
  - `monthlyTrend(txs, monthsBack?, now?): TrendMonth[]` — oldest→newest, default `monthsBack = 6`.
  - `interface MerchantSpend { merchant: string; totalCents: number }`
  - `topMerchants(txs, n?): MerchantSpend[]` — default `n = 5`; desc by total, ties by merchant asc.

- [ ] **Step 1: Write the failing test**

Create `features/insights/aggregate.test.ts`:
```ts
import type { Transaction } from '@/features/transactions/types';
import { monthlyTrend, sumCents, topMerchants } from './aggregate';

const NOW = new Date(2026, 5, 15); // Jun 2026

function tx(p: Partial<Transaction> & { date: string }): Transaction {
  return {
    id: `${p.date}-${p.merchant ?? ''}`, household_id: 'h', user_id: 'u', amount_eur: 100,
    original_amount: null, original_currency: null, merchant: 'M',
    category_id: null, note: null, source: 'manual', receipt_id: null,
    is_flagged: false, occurred_at: null, created_at: `${p.date}T00:00:00.000Z`,
    ...p,
  };
}

describe('sumCents', () => {
  it('adds amount_eur', () => {
    expect(sumCents([tx({ date: '2026-06-01', amount_eur: 500 }), tx({ date: '2026-06-02', amount_eur: 250 })])).toBe(750);
  });
  it('is zero for an empty list', () => {
    expect(sumCents([])).toBe(0);
  });
});

describe('monthlyTrend', () => {
  it('produces monthsBack buckets oldest→newest with BG labels and a current flag', () => {
    const rows = monthlyTrend([], 6, NOW);
    expect(rows.map((r) => r.label)).toEqual(['ЯНУ', 'ФЕВ', 'МАР', 'АПР', 'МАЙ', 'ЮНИ']);
    expect(rows[5]!.isCurrent).toBe(true);
    expect(rows.slice(0, 5).every((r) => !r.isCurrent)).toBe(true);
  });
  it('buckets spend by month and scales fraction to the tallest bar', () => {
    const rows = monthlyTrend(
      [
        tx({ date: '2026-04-10', amount_eur: 1000 }), // АПР
        tx({ date: '2026-06-01', amount_eur: 4000 }), // ЮНИ
        tx({ date: '2026-06-20', amount_eur: 0 }),
      ],
      6,
      NOW,
    );
    const jun = rows.find((r) => r.label === 'ЮНИ')!;
    const apr = rows.find((r) => r.label === 'АПР')!;
    expect([jun.totalCents, apr.totalCents]).toEqual([4000, 1000]);
    expect(jun.fraction).toBe(1);
    expect(apr.fraction).toBe(0.25);
  });
  it('all-zero spend yields fraction 0 (no NaN)', () => {
    expect(monthlyTrend([], 6, NOW).every((r) => r.fraction === 0)).toBe(true);
  });
  it('excludes months outside the window', () => {
    const rows = monthlyTrend([tx({ date: '2025-12-31', amount_eur: 5000 })], 6, NOW); // Dec 2025, just before Jan
    expect(rows.every((r) => r.totalCents === 0)).toBe(true);
  });
});

describe('topMerchants', () => {
  const txs = [
    tx({ date: '2026-06-01', merchant: 'Kaufland', amount_eur: 1000 }),
    tx({ date: '2026-06-02', merchant: 'Kaufland', amount_eur: 500 }),
    tx({ date: '2026-06-03', merchant: 'Lidl', amount_eur: 2000 }),
    tx({ date: '2026-06-04', merchant: 'Billa', amount_eur: 1500 }),
  ];
  it('groups, sums, sorts by total desc with ties broken by name asc', () => {
    expect(topMerchants(txs).map((m) => [m.merchant, m.totalCents])).toEqual([
      ['Lidl', 2000],
      ['Billa', 1500],
      ['Kaufland', 1500],
    ]);
  });
  it('limits to n', () => {
    expect(topMerchants(txs, 2)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest features/insights/aggregate.test.ts`
Expected: FAIL — cannot find module `./aggregate`.

- [ ] **Step 3: Implement**

Create `features/insights/aggregate.ts`:
```ts
import { monthAbbr } from '@/lib/dates';
import type { Transaction } from '@/features/transactions/types';

/** Total of amount_eur (cents) across the given transactions. */
export function sumCents(txs: Transaction[]): number {
  return txs.reduce((total, tx) => total + tx.amount_eur, 0);
}

export interface TrendMonth {
  label: string; // BG month abbreviation
  totalCents: number;
  fraction: number; // 0..1 of the tallest bar
  isCurrent: boolean;
}

/** Spend per calendar month for the last `monthsBack` months (oldest→newest). */
export function monthlyTrend(
  txs: Transaction[],
  monthsBack = 6,
  now: Date = new Date(),
): TrendMonth[] {
  const prefixes: string[] = [];
  const buckets: TrendMonth[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    prefixes.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-`);
    buckets.push({ label: monthAbbr(d.getMonth()), totalCents: 0, fraction: 0, isCurrent: i === 0 });
  }

  for (const tx of txs) {
    const idx = prefixes.findIndex((p) => tx.date.startsWith(p));
    if (idx !== -1) buckets[idx]!.totalCents += tx.amount_eur;
  }

  const max = Math.max(0, ...buckets.map((b) => b.totalCents));
  if (max > 0) for (const b of buckets) b.fraction = b.totalCents / max;
  return buckets;
}

export interface MerchantSpend {
  merchant: string;
  totalCents: number;
}

/** Merchants ranked by total spend desc (ties by name asc), top `n`. */
export function topMerchants(txs: Transaction[], n = 5): MerchantSpend[] {
  const totals = new Map<string, number>();
  for (const tx of txs) {
    totals.set(tx.merchant, (totals.get(tx.merchant) ?? 0) + tx.amount_eur);
  }
  return [...totals.entries()]
    .map(([merchant, totalCents]) => ({ merchant, totalCents }))
    .sort((a, b) => b.totalCents - a.totalCents || a.merchant.localeCompare(b.merchant))
    .slice(0, n);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest features/insights/aggregate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/insights/aggregate.ts features/insights/aggregate.test.ts
git commit -m "$(cat <<'EOF'
feat(insights): sumCents, monthlyTrend, topMerchants aggregations

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Shared `Comparison` + `Skeleton` components

**Files:**
- Create: `components/Comparison.tsx`
- Create: `components/Skeleton.tsx`
- Modify: `app/(app)/index.tsx`

**Interfaces:**
- Produces:
  - `Comparison({ pct, label }: { pct: number | null; label: string })` — signed % delta line; returns `null` when `pct` is `null`.
  - `Skeleton({ height?, width?, radius? }: { height?: number; width?: DimensionValue; radius?: number })` — neutral placeholder block.

> No unit test: both are presentational primitives (project convention — UI is verified via typecheck/lint and the screens that use it). The `Comparison` extraction is behaviour-preserving; the gate is the full suite + `tsc` staying green.

- [ ] **Step 1: Create `components/Comparison.tsx`**

```tsx
import { MaterialIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

/**
 * Signed % delta line shared by Dashboard and Insights.
 * ▲ error-red for an increase, ▼ lime for a decrease, — grey when flat.
 * Renders nothing when `pct` is null (no baseline).
 */
export function Comparison({ pct, label }: { pct: number | null; label: string }) {
  if (pct === null) return null;
  const up = pct > 0;
  const color = pct === 0 ? '#c4c6d0' : up ? '#ffb4ab' : '#c3f400';
  const icon = pct === 0 ? 'remove' : up ? 'arrow-upward' : 'arrow-downward';
  return (
    <View className="flex-row items-center gap-1">
      <MaterialIcons name={icon} size={14} color={color} />
      <Text style={{ color }} className="font-inter text-body-md">
        {Math.abs(pct)}% {label}
      </Text>
    </View>
  );
}
```

- [ ] **Step 2: Create `components/Skeleton.tsx`**

```tsx
import { View, type DimensionValue } from 'react-native';

/** A neutral loading placeholder block (no shimmer). */
export function Skeleton({
  height = 16,
  width = '100%',
  radius = 8,
}: {
  height?: number;
  width?: DimensionValue;
  radius?: number;
}) {
  return (
    <View
      className="bg-surface-container-high"
      style={{ height, width, borderRadius: radius, opacity: 0.6 }}
    />
  );
}
```

- [ ] **Step 3: Use the shared `Comparison` in the dashboard**

In `app/(app)/index.tsx`:
1. Delete the local `Comparison` function (the `function Comparison({ pct, label }...) { ... }` block, lines ~33–46).
2. Add the import alongside the other `@/components` imports:
```tsx
import { Comparison } from '@/components/Comparison';
```
Leave every usage of `<Comparison ... />` unchanged. Do not remove the `MaterialIcons` import — it is still used elsewhere in the file.

- [ ] **Step 4: Typecheck, lint, full suite**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: PASS — `tsc` clean, lint 0/0, all suites green (the dashboard renders the same delta from the shared component).

- [ ] **Step 5: Commit**

```bash
git add components/Comparison.tsx components/Skeleton.tsx app/(app)/index.tsx
git commit -m "$(cat <<'EOF'
refactor(ui): extract shared Comparison; add Skeleton placeholder

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Wire the Insights screen

**Files:**
- Modify: `app/(app)/insights.tsx`

**Interfaces:**
- Consumes: `categoryBreakdown`, `filterByUser`, `pctChange` from `@/features/transactions/dashboard`; `sumCents`, `monthlyTrend`, `topMerchants` from `@/features/insights/aggregate`; `comparisonRange`, `filterByDateBounds`, `filterByRange`, `TimeRange` from `@/features/insights/range`; `Comparison`, `Skeleton`, `SegmentedToggle`, `EmptyState`, `Screen`, `SectionLabel`, `HairlineDivider`; stores `useTransactionsStore`, `useAuthStore`; `formatCurrency`.
- Produces: the live Insights screen. No new exports.

> Screen (UI) task — verified by typecheck, lint, and the full suite (no render unit test, per project convention). All logic lives in the helpers tested in Tasks 1–4.

- [ ] **Step 1: Replace the screen implementation**

Overwrite `app/(app)/insights.tsx` with:
```tsx
import { MaterialIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Comparison } from '@/components/Comparison';
import { EmptyState } from '@/components/EmptyState';
import { HairlineDivider } from '@/components/HairlineDivider';
import { Screen } from '@/components/Screen';
import { SectionLabel } from '@/components/SectionLabel';
import { SegmentedToggle } from '@/components/SegmentedToggle';
import { Skeleton } from '@/components/Skeleton';
import { useAuthStore } from '@/features/auth/store';
import { monthlyTrend, sumCents, topMerchants } from '@/features/insights/aggregate';
import {
  comparisonRange,
  filterByDateBounds,
  filterByRange,
  type TimeRange,
} from '@/features/insights/range';
import { categoryBreakdown, filterByUser, pctChange } from '@/features/transactions/dashboard';
import { useTransactionsStore } from '@/features/transactions/store';
import { formatCurrency } from '@/lib/formatCurrency';

type Scope = 'me' | 'household';

// STATIC placeholder until Day 13 wires real anomalies.
const ANOMALIES = [
  { name: 'Amazon.de', reason: 'Необичайна сума', amountCents: 45800, icon: 'warning' as const },
  { name: 'Le Bistro', reason: 'Висока честота', amountCents: 12450, icon: 'restaurant' as const },
];

export default function InsightsScreen() {
  const transactions = useTransactionsStore((s) => s.transactions);
  const categories = useTransactionsStore((s) => s.categories);
  const loaded = useTransactionsStore((s) => s.loaded);
  const loading = useTransactionsStore((s) => s.loading);
  const userId = useAuthStore((s) => s.session?.user.id ?? null);

  const [range, setRange] = useState<TimeRange>('this_month');
  const [scope, setScope] = useState<Scope>('household');

  const now = useMemo(() => new Date(), []);
  const personFiltered = useMemo(
    () => filterByUser(transactions, scope === 'me' ? userId : null),
    [transactions, scope, userId],
  );
  const rangeFiltered = useMemo(
    () => filterByRange(personFiltered, range, now),
    [personFiltered, range, now],
  );

  const heroTotal = useMemo(() => sumCents(rangeFiltered), [rangeFiltered]);
  const comparison = useMemo(() => {
    const c = comparisonRange(range, now);
    return pctChange(heroTotal, sumCents(filterByDateBounds(personFiltered, c.startISO, c.endISO)));
  }, [heroTotal, personFiltered, range, now]);
  const comparisonLabel = range === 'this_month' ? 'спрямо миналия месец' : 'спрямо предходния период';

  const categoryRows = useMemo(
    () => categoryBreakdown(rangeFiltered, categories),
    [rangeFiltered, categories],
  );
  const trend = useMemo(() => monthlyTrend(personFiltered, 6, now), [personFiltered, now]);
  const merchants = useMemo(() => topMerchants(rangeFiltered, 5), [rangeFiltered]);

  const showSkeleton = loading && !loaded;
  const showEmpty = loaded && transactions.length === 0;

  return (
    <Screen withTabBar>
      <Text className="mb-lg mt-md font-jakarta-semibold text-headline-xl text-on-surface">
        Анализи
      </Text>

      {showSkeleton ? (
        <View className="gap-xl pt-md">
          <Skeleton height={56} width="60%" />
          <Skeleton height={120} />
          <Skeleton height={120} />
          <Skeleton height={80} />
        </View>
      ) : showEmpty ? (
        <EmptyState
          icon="insights"
          title="Няма данни за анализ"
          message="Добави транзакции, за да видиш разбивки и тенденции."
        />
      ) : (
        <>
          {/* Controls */}
          <View className="mb-xl gap-md">
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <SegmentedToggle<TimeRange>
                value={range}
                onChange={setRange}
                options={[
                  { value: 'this_month', label: 'Този месец' },
                  { value: 'last_month', label: 'Минал месец' },
                  { value: 'last_3_months', label: '3 месеца' },
                  { value: 'year', label: 'Година' },
                ]}
              />
            </ScrollView>
            <View className="items-start">
              <SegmentedToggle<Scope>
                value={scope}
                onChange={setScope}
                options={[
                  { value: 'me', label: 'Аз' },
                  { value: 'household', label: 'Домакинство' },
                ]}
              />
            </View>
          </View>

          {/* Hero total */}
          <View className="gap-xs">
            <Text className="font-jakarta-semibold text-headline-xl text-primary">
              {formatCurrency(heroTotal)}
            </Text>
            <Comparison pct={comparison} label={comparisonLabel} />
          </View>

          {/* AI summary — STATIC placeholder (Day 14) */}
          <View className="mt-xl flex-row gap-md">
            <View className="w-1 rounded-full bg-surface-tint opacity-30" />
            <View className="flex-1 gap-sm">
              <View className="flex-row items-center gap-sm">
                <MaterialIcons name="auto-awesome" size={14} color="#c4c6d0" />
                <SectionLabel>AI обобщение</SectionLabel>
              </View>
              <Text className="font-inter text-body-md leading-relaxed text-on-surface-variant">
                Похарчихте €340 повече от миналия месец, основно за хранене навън.
                Хранителните стоки останаха без промяна, а разходите за развлечения
                леко намаляха.
              </Text>
            </View>
          </View>

          <HairlineDivider className="my-xl" />

          {/* Spending by category */}
          <SectionLabel className="mb-lg">Разходи по категория</SectionLabel>
          {categoryRows.length === 0 ? (
            <Text className="font-inter text-body-md text-on-surface-variant">
              Няма разходи за този период.
            </Text>
          ) : (
            <View className="gap-lg">
              {categoryRows.map((c) => (
                <View key={c.id} className="gap-sm">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-md">
                      <View className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                      <Text className="font-inter text-body-md text-on-surface">{c.name}</Text>
                    </View>
                    <Text className="font-inter-semibold text-data-mono text-on-surface">
                      {formatCurrency(c.totalCents)}
                    </Text>
                  </View>
                  <View className="h-1 w-full overflow-hidden rounded-full bg-surface-container-highest">
                    <View
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(c.fraction * 100, 2)}%`, backgroundColor: c.color }}
                    />
                  </View>
                </View>
              ))}
            </View>
          )}

          <HairlineDivider className="my-xl" />

          {/* Monthly trend — fixed last 6 months (range pill ignored) */}
          <SectionLabel className="mb-lg">Месечна тенденция</SectionLabel>
          <View className="h-32 flex-row items-end justify-between gap-md">
            {trend.map((m) => (
              <View key={m.label} className="flex-1 items-center gap-sm">
                <View
                  className={`w-full rounded-t-sm ${m.isCurrent ? 'border-t-2 border-primary bg-primary/40' : 'bg-surface-container-highest'}`}
                  style={{ height: `${Math.max(m.fraction * 100, 2)}%` }}
                />
                <Text
                  className={`font-inter text-[10px] ${m.isCurrent ? 'text-primary' : 'text-on-surface-variant opacity-60'}`}>
                  {m.label}
                </Text>
              </View>
            ))}
          </View>

          <HairlineDivider className="my-xl" />

          {/* Top merchants */}
          <SectionLabel className="mb-md">Топ търговци</SectionLabel>
          {merchants.length === 0 ? (
            <Text className="font-inter text-body-md text-on-surface-variant">
              Няма търговци за този период.
            </Text>
          ) : (
            <View>
              {merchants.map((m, i) => (
                <View key={m.merchant}>
                  <View className="flex-row items-center justify-between py-md">
                    <View className="flex-row items-center gap-md">
                      <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-container-high">
                        <MaterialIcons name="store" size={20} color="#c4c6d0" />
                      </View>
                      <Text className="font-inter text-body-md text-on-surface">{m.merchant}</Text>
                    </View>
                    <Text className="font-inter-semibold text-data-mono text-on-surface">
                      {formatCurrency(m.totalCents)}
                    </Text>
                  </View>
                  {i < merchants.length - 1 ? <HairlineDivider /> : null}
                </View>
              ))}
            </View>
          )}

          <HairlineDivider className="my-xl" />

          {/* Anomalies — STATIC placeholder (Day 13) */}
          <SectionLabel className="mb-md">Аномалии</SectionLabel>
          <View className="gap-md">
            {ANOMALIES.map((a) => (
              <View
                key={a.name}
                className="flex-row items-center justify-between rounded-xl border border-secondary-fixed/20 bg-secondary-fixed/5 p-md">
                <View className="flex-row items-center gap-md">
                  <View className="relative">
                    <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-container-high">
                      <MaterialIcons name={a.icon} size={20} color="#c3f400" />
                    </View>
                    <View className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-background bg-secondary-fixed" />
                  </View>
                  <View>
                    <Text className="font-inter-semibold text-body-md text-on-surface">{a.name}</Text>
                    <Text className="font-inter text-[10px] uppercase text-secondary-fixed">{a.reason}</Text>
                  </View>
                </View>
                <Text className="font-inter-semibold text-data-mono text-secondary-fixed">
                  {formatCurrency(a.amountCents)}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS — no type or lint errors. (If lint flags an unused import, remove just that import.)

- [ ] **Step 3: Full test run**

Run: `npm test`
Expected: PASS — all suites green (no screen test added; helpers from Tasks 1–4 stay green).

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/insights.tsx"
git commit -m "$(cat <<'EOF'
feat(insights): wire screen to real data with range + person filters

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Build-plan update

**Files:**
- Modify: `teftera-build-plan.md`

> No code. Records Day 12 completion, consistent with how prior days were closed out.

- [ ] **Step 1: Check off Day 12 and add a note**

In `teftera-build-plan.md`, under `### Day 12 — Insights Screen: Real Data`, change each `- [ ]` to `- [x]`, amend the trend line to reflect the proportional-View approach, and append a note. Replace the six checklist lines with:
```markdown
- [x] Spending by category: real query, proportional bars, sorted high to low
- [x] Monthly trend: 6-month bar chart from aggregated data *(proportional Views — Victory Native XL deferred, see charts-deferred)*
- [x] Top merchants: ranked by total spent, selected range
- [x] Time range filter pills (This Month / Last Month / 3 Months / Year) actually filter the queries
- [x] Per-person vs household toggle
- [x] Loading skeletons while data fetches

> Implemented + reviewed on branch `feat/day12-insights-real-data` (plan `docs/superpowers/plans/2026-06-28-day12-insights-real-data.md`). Pure helpers in `features/insights/` (`range.ts`, `aggregate.ts`) + a shared `categoryBreakdown` extracted from `dashboard.ts`; all unit-tested. Range pills scope the hero/category/merchant sections; the trend stays a fixed last-6-months view. AI summary (Day 14) and Anomalies (Day 13) remain static placeholders. No chart library added.
```

- [ ] **Step 2: Commit**

```bash
git add teftera-build-plan.md
git commit -m "$(cat <<'EOF'
docs(day12): mark Insights real-data complete

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** category breakdown real + sorted (T2/T6) · monthly trend 6-month proportional Views (T1/T4/T6) · top merchants ranked, range-scoped (T4/T6) · range pills filter hero/category/merchants (T3/T6) · person/household toggle (T6, reuses `filterByUser`) · loading skeletons (T5/T6) · trend fixed 6-month, person-aware (T6) · hero delta via shared `Comparison`, no lime invention (T5/T6) · AI summary + Anomalies left static (T6) · floating bar removed (T6). All spec sections map to a task.
- **Type consistency:** `TimeRange`/`DateBounds` (T3) consumed in T6; `TrendMonth`/`MerchantSpend` (T4) consumed in T6; `categoryBreakdown`/`CategorySpend` (T2) consumed in T6; `monthAbbr` (T1) consumed by T4; `Comparison`/`Skeleton` (T5) consumed in T6.
- **No placeholders:** every code step carries complete code; the only conditional instruction (remove an unused import if lint flags it) is a concrete lint-driven action.

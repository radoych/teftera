# Day 15 — Budget Goals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Monthly per-category household budgets with carry-forward semantics, budget progress bars on Dashboard + Insights, and an 80%/over-budget local notification fired client-side after each transaction save.

**Architecture:** A new `features/budgets/` slice mirroring the Day 13 `features/anomalies/` pattern: pure tested helpers (`resolve`, `progress`, crossing logic) + thin Supabase `api` + in-memory store + an `expo-notifications` wrapper. The 80%/100% check runs in `runBudgetCheck`, called after each save at the same call sites as the anomaly `runDetection`, reading budgets and transactions from in-memory stores (zero extra DB I/O). Dedup markers are device-local in AsyncStorage.

**Tech Stack:** React Native + Expo, TypeScript (strict), Zustand, Supabase, `expo-notifications` (new, free), `@react-native-async-storage/async-storage` (already installed), Jest.

## Global Constraints

- Money = integer **euro cents**. No float arithmetic. All display through `formatCurrency`. (CLAUDE.md rule 1)
- Currency is **EUR (€)**. No `$`, no USD. (rule 2)
- `household_id` on every table; RLS already present on `budgets` — **no migration in this plan**. (rule 3)
- TypeScript strict; no `any`; no plain `.js`. Feature-based folders.
- Conventional commits: `feat:` / `test:` / `refactor:` etc.
- UI copy in **bg-BG** (Bulgarian), matching existing screens.
- Pill buttons → `borderRadius: 9999`. Hairline dividers → `StyleSheet.hairlineWidth` + `rgba(255,255,255,0.05)`. Lime `secondary-fixed` (`#c3f400`) is **anomaly-only** — budgets never use it.
- Action rows owned by `FloatingActionBar` / `SheetActions`, not hand-rolled.
- Budget surfaces are **household-scoped** and ignore the per-person/household toggle.
- Notification + DB failures are best-effort: never throw, never block a save. (rule 6 spirit)
- `expo-notifications` is free — allowed. No other new deps without asking.

---

## File Structure

```
features/budgets/
  types.ts            BudgetRow, ResolvedBudget, BudgetProgress, BudgetState
  resolve.ts          resolveBudgetsForMonth (pure, tested)
  progress.ts         budgetProgress (pure, tested)
  api.ts              fetchBudgets, upsertBudget, deleteBudget (thin Supabase)
  store.ts            useBudgetsStore (rows in memory) + loadBudgets
  alertStore.ts       device-local dedup markers (AsyncStorage), pure key helper tested
  notify.ts           expo-notifications wrapper (thin)
  runBudgetCheck.ts   crossing + dedup decision (tested, layers mocked)
components/
  AmountInput.tsx     shared cents/auto-decimal input; formatDigitsAsAmount tested
app/
  budgets.tsx         budget setup screen
```

**Modified:**
- `features/preferences/types.ts` — add `budgetAlertsEnabled?: boolean`
- `app/(app)/profile.tsx` — wire the existing toggle to preferences + add "Manage budgets" entry row
- `app/(app)/index.tsx` — budget progress bars in the category section
- `app/(app)/insights.tsx` — "Budget vs Actual" section
- `app/manual-entry.tsx`, `app/confirm-receipt.tsx` — call `runBudgetCheck` after save

---

## Task 1: Budget types + carry-forward resolve

**Files:**
- Create: `features/budgets/types.ts`
- Create: `features/budgets/resolve.ts`
- Test: `features/budgets/resolve.test.ts`

**Interfaces:**
- Consumes: `firstOfMonth` from `@/lib/dates`.
- Produces:
  - `interface BudgetRow { id: string; household_id: string; category_id: string | null; amount_eur: number; month: string }` (`month` is `YYYY-MM-01`)
  - `type ResolvedBudgets = Map<string, number>` (categoryId → amountCents)
  - `resolveBudgetsForMonth(rows: BudgetRow[], month: string): ResolvedBudgets`

- [ ] **Step 1: Write the failing test**

```ts
// features/budgets/resolve.test.ts
import { resolveBudgetsForMonth } from './resolve';
import type { BudgetRow } from './types';

const row = (category_id: string, amount_eur: number, month: string): BudgetRow => ({
  id: `${category_id}-${month}`,
  household_id: 'h1',
  category_id,
  amount_eur,
  month,
});

describe('resolveBudgetsForMonth', () => {
  it('returns the exact current-month row when present', () => {
    const rows = [row('groceries', 20000, '2026-06-01')];
    expect(resolveBudgetsForMonth(rows, '2026-06-01').get('groceries')).toBe(20000);
  });

  it('carries forward the most recent prior month when none exists for the target', () => {
    const rows = [row('groceries', 20000, '2026-04-01'), row('groceries', 25000, '2026-05-01')];
    expect(resolveBudgetsForMonth(rows, '2026-06-01').get('groceries')).toBe(25000);
  });

  it('prefers the exact month over an earlier one', () => {
    const rows = [row('groceries', 20000, '2026-05-01'), row('groceries', 30000, '2026-06-01')];
    expect(resolveBudgetsForMonth(rows, '2026-06-01').get('groceries')).toBe(30000);
  });

  it('ignores rows from future months', () => {
    const rows = [row('groceries', 20000, '2026-07-01')];
    expect(resolveBudgetsForMonth(rows, '2026-06-01').has('groceries')).toBe(false);
  });

  it('returns no entry for a category with no budget at or before the target', () => {
    expect(resolveBudgetsForMonth([], '2026-06-01').size).toBe(0);
  });

  it('skips rows with a null category_id', () => {
    const rows: BudgetRow[] = [{ id: 'x', household_id: 'h1', category_id: null, amount_eur: 100, month: '2026-06-01' }];
    expect(resolveBudgetsForMonth(rows, '2026-06-01').size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest features/budgets/resolve.test.ts`
Expected: FAIL — cannot find module `./resolve`.

- [ ] **Step 3: Write the types and implementation**

```ts
// features/budgets/types.ts
export interface BudgetRow {
  id: string;
  household_id: string;
  category_id: string | null;
  amount_eur: number; // euro cents
  month: string; // YYYY-MM-01
}

export type ResolvedBudgets = Map<string, number>; // categoryId -> amountCents

export type BudgetState = 'under' | 'warning' | 'over';

export interface BudgetProgress {
  categoryId: string;
  budgetCents: number;
  spentCents: number;
  pct: number; // 0..(>100), spent/budget * 100, rounded
  state: BudgetState;
}
```

```ts
// features/budgets/resolve.ts
import type { BudgetRow, ResolvedBudgets } from './types';

/**
 * Carry-forward resolution: for each category, pick the row matching `month`,
 * else the most recent row strictly before it. Rows after `month` are ignored.
 * `month` is a YYYY-MM-01 string; row.month uses the same format, so lexical
 * comparison is chronological.
 */
export function resolveBudgetsForMonth(rows: BudgetRow[], month: string): ResolvedBudgets {
  const best = new Map<string, BudgetRow>();
  for (const r of rows) {
    if (r.category_id === null) continue;
    if (r.month > month) continue;
    const current = best.get(r.category_id);
    if (!current || r.month > current.month) best.set(r.category_id, r);
  }
  const out: ResolvedBudgets = new Map();
  for (const [categoryId, r] of best) out.set(categoryId, r.amount_eur);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest features/budgets/resolve.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add features/budgets/types.ts features/budgets/resolve.ts features/budgets/resolve.test.ts
git commit -m "feat(budgets): carry-forward budget resolution"
```

---

## Task 2: budgetProgress

**Files:**
- Create: `features/budgets/progress.ts`
- Test: `features/budgets/progress.test.ts`

**Interfaces:**
- Consumes: `ResolvedBudgets`, `BudgetProgress`, `BudgetState` from `./types`; `CategorySpend` shape (uses `id` + `totalCents`) from `@/features/transactions/dashboard`.
- Produces: `budgetProgress(resolved: ResolvedBudgets, spend: { id: string; totalCents: number }[]): BudgetProgress[]` — one entry per budgeted category, sorted by `pct` descending.

- [ ] **Step 1: Write the failing test**

```ts
// features/budgets/progress.test.ts
import { budgetProgress } from './progress';

describe('budgetProgress', () => {
  const spend = [
    { id: 'groceries', totalCents: 16000 },
    { id: 'dining', totalCents: 5000 },
  ];

  it('computes pct and under/warning/over per budgeted category', () => {
    const resolved = new Map([
      ['groceries', 20000], // 80% -> warning
      ['dining', 20000], // 25% -> under
    ]);
    const rows = budgetProgress(resolved, spend);
    const g = rows.find((r) => r.categoryId === 'groceries')!;
    expect(g).toMatchObject({ budgetCents: 20000, spentCents: 16000, pct: 80, state: 'warning' });
    expect(rows.find((r) => r.categoryId === 'dining')!.state).toBe('under');
  });

  it('treats exactly 80% as warning and just below as under', () => {
    expect(budgetProgress(new Map([['x', 10000]]), [{ id: 'x', totalCents: 7999 }])[0].state).toBe('under');
    expect(budgetProgress(new Map([['x', 10000]]), [{ id: 'x', totalCents: 8000 }])[0].state).toBe('warning');
  });

  it('treats exactly 100% as warning and just above as over', () => {
    expect(budgetProgress(new Map([['x', 10000]]), [{ id: 'x', totalCents: 10000 }])[0].state).toBe('warning');
    expect(budgetProgress(new Map([['x', 10000]]), [{ id: 'x', totalCents: 10001 }])[0].state).toBe('over');
  });

  it('includes budgeted categories with zero spend', () => {
    const rows = budgetProgress(new Map([['x', 10000]]), []);
    expect(rows[0]).toMatchObject({ spentCents: 0, pct: 0, state: 'under' });
  });

  it('ignores spend for categories without a budget', () => {
    const rows = budgetProgress(new Map(), [{ id: 'x', totalCents: 9999 }]);
    expect(rows).toHaveLength(0);
  });

  it('sorts by pct descending', () => {
    const resolved = new Map([['a', 10000], ['b', 10000]]);
    const rows = budgetProgress(resolved, [{ id: 'a', totalCents: 2000 }, { id: 'b', totalCents: 9000 }]);
    expect(rows.map((r) => r.categoryId)).toEqual(['b', 'a']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest features/budgets/progress.test.ts`
Expected: FAIL — cannot find module `./progress`.

- [ ] **Step 3: Write the implementation**

```ts
// features/budgets/progress.ts
import type { BudgetProgress, BudgetState, ResolvedBudgets } from './types';

/**
 * State keys off integer cents, NOT the rounded pct, so boundaries are exact:
 *  - over    : spent strictly exceeds budget (e.g. 10001 vs 10000 cents)
 *  - warning : spent is >= 80% of budget but not over
 *  - under   : otherwise
 * (Rounding pct for state would misclassify 100.01% as 100% → warning.)
 */
function stateFor(spentCents: number, budgetCents: number): BudgetState {
  if (budgetCents <= 0) return 'under';
  if (spentCents > budgetCents) return 'over';
  if (spentCents * 100 >= budgetCents * 80) return 'warning';
  return 'under';
}

/**
 * Compute spend-vs-budget for every budgeted category. `spend` is the
 * categoryBreakdown output (only `id` + `totalCents` are used). Categories with
 * no resolved budget are omitted. Sorted by pct descending.
 */
export function budgetProgress(
  resolved: ResolvedBudgets,
  spend: { id: string; totalCents: number }[],
): BudgetProgress[] {
  const spentById = new Map(spend.map((s) => [s.id, s.totalCents]));
  const rows: BudgetProgress[] = [];
  for (const [categoryId, budgetCents] of resolved) {
    const spentCents = spentById.get(categoryId) ?? 0;
    const pct = budgetCents > 0 ? Math.round((spentCents / budgetCents) * 100) : 0;
    rows.push({ categoryId, budgetCents, spentCents, pct, state: stateFor(spentCents, budgetCents) });
  }
  rows.sort((a, b) => b.pct - a.pct);
  return rows;
}
```

> Note: `state` is computed from integer cents so the over-budget boundary is exact (`10001` vs `10000` cents → `over`, even though `pct` rounds to `100`). `pct` is display-only. At exactly 80% → warning; exactly 100% (equal cents) → warning; any amount over budget → over.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest features/budgets/progress.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add features/budgets/progress.ts features/budgets/progress.test.ts
git commit -m "feat(budgets): spend-vs-budget progress helper"
```

---

## Task 3: Supabase api + budgets store + load wiring

**Files:**
- Create: `features/budgets/api.ts`
- Create: `features/budgets/store.ts`
- Modify: wherever transactions are loaded for the app — locate with the command in Step 1 and add a `loadBudgets(householdId)` call alongside the existing transactions load.

**Interfaces:**
- Consumes: `supabase` from `@/services/supabase`; `BudgetRow` from `./types`; `firstOfMonth` from `@/lib/dates`.
- Produces:
  - `fetchBudgets(householdId: string): Promise<BudgetRow[]>`
  - `upsertBudget(input: { householdId: string; categoryId: string; amountCents: number; month: string }): Promise<void>`
  - `deleteBudget(input: { householdId: string; categoryId: string; month: string }): Promise<void>`
  - `useBudgetsStore` with `{ rows: BudgetRow[]; loaded: boolean; setRows(rows): void; reset(): void }`
  - `loadBudgets(householdId: string): Promise<void>` (fetches + sets store; best-effort)

- [ ] **Step 1: Find where transactions are loaded**

Run: `grep -rn "refreshTransactions\|setData(" features/transactions app --include=*.ts --include=*.tsx | grep -v test`
Read that loader (likely `features/transactions/sync.ts`) so the budgets load can sit beside it on the same household-scoped trigger.

- [ ] **Step 2: Write the api module**

```ts
// features/budgets/api.ts — the ONLY module that reads/writes the budgets table.
import { supabase } from '@/services/supabase';
import type { BudgetRow } from './types';

export async function fetchBudgets(householdId: string): Promise<BudgetRow[]> {
  const { data, error } = await supabase
    .from('budgets')
    .select('id, household_id, category_id, amount_eur, month')
    .eq('household_id', householdId);
  if (error) throw error;
  return (data ?? []) as BudgetRow[];
}

export async function upsertBudget(input: {
  householdId: string;
  categoryId: string;
  amountCents: number;
  month: string;
}): Promise<void> {
  const { error } = await supabase
    .from('budgets')
    .upsert(
      {
        household_id: input.householdId,
        category_id: input.categoryId,
        amount_eur: input.amountCents,
        month: input.month,
      },
      { onConflict: 'household_id,category_id,month' },
    );
  if (error) throw error;
}

export async function deleteBudget(input: {
  householdId: string;
  categoryId: string;
  month: string;
}): Promise<void> {
  const { error } = await supabase
    .from('budgets')
    .delete()
    .eq('household_id', input.householdId)
    .eq('category_id', input.categoryId)
    .eq('month', input.month);
  if (error) throw error;
}
```

- [ ] **Step 3: Write the store + loader**

```ts
// features/budgets/store.ts
import { create } from 'zustand';
import { fetchBudgets } from './api';
import type { BudgetRow } from './types';

interface BudgetsState {
  rows: BudgetRow[];
  loaded: boolean;
  setRows: (rows: BudgetRow[]) => void;
  reset: () => void;
}

export const useBudgetsStore = create<BudgetsState>((set) => ({
  rows: [],
  loaded: false,
  setRows: (rows) => set({ rows, loaded: true }),
  reset: () => set({ rows: [], loaded: false }),
}));

/** Best-effort load into the store; a failure leaves prior rows intact. */
export async function loadBudgets(householdId: string): Promise<void> {
  try {
    const rows = await fetchBudgets(householdId);
    useBudgetsStore.getState().setRows(rows);
  } catch (err) {
    if (__DEV__) console.warn('[budgets] load failed', err);
  }
}
```

- [ ] **Step 4: Wire the load**

In the transactions loader found in Step 1, after the transactions are fetched/set for a `householdId`, add:

```ts
import { loadBudgets } from '@/features/budgets/store';
// ...after the existing household-scoped transactions load:
void loadBudgets(householdId);
```

Also call `useBudgetsStore.getState().reset()` wherever `useTransactionsStore.getState().reset()` is called on sign-out (find with `grep -rn "useTransactionsStore.getState().reset" app features`).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add features/budgets/api.ts features/budgets/store.ts features/transactions app
git commit -m "feat(budgets): supabase api + in-memory budgets store"
```

---

## Task 4: Shared AmountInput (cents / auto-decimal)

**Files:**
- Create: `components/AmountInput.tsx`
- Test: `components/AmountInput.test.ts` (tests the pure formatter only)

**Interfaces:**
- Produces:
  - `formatDigitsAsAmount(digits: string): string` — a digit buffer → `"12,34"` style display (comma decimal, bg-BG), always 2 decimals; empty → `""`.
  - `AmountInput` component: props `{ valueCents: number; onChangeCents: (cents: number) => void; placeholder?: string }`. Renders a `TextInput` with `keyboardType="number-pad"`; maintains a digit buffer internally so typing `1234` shows `12,34` (= 1234 cents).

- [ ] **Step 1: Write the failing test for the formatter**

```ts
// components/AmountInput.test.ts
import { formatDigitsAsAmount } from './AmountInput';

describe('formatDigitsAsAmount', () => {
  it('returns empty string for no digits', () => {
    expect(formatDigitsAsAmount('')).toBe('');
  });
  it('pads to cents: "5" -> "0,05"', () => {
    expect(formatDigitsAsAmount('5')).toBe('0,05');
  });
  it('"50" -> "0,50"', () => {
    expect(formatDigitsAsAmount('50')).toBe('0,50');
  });
  it('"1234" -> "12,34"', () => {
    expect(formatDigitsAsAmount('1234')).toBe('12,34');
  });
  it('strips leading zeros on the euro part: "0200" -> "2,00"', () => {
    expect(formatDigitsAsAmount('0200')).toBe('2,00');
  });
  it('handles large values: "100000" -> "1000,00"', () => {
    expect(formatDigitsAsAmount('100000')).toBe('1000,00');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest components/AmountInput.test.ts`
Expected: FAIL — cannot find module `./AmountInput` / `formatDigitsAsAmount` not exported.

- [ ] **Step 3: Implement the component + formatter**

Model after the existing `components/FlatInput.tsx` for styling (read it first). Key code:

```tsx
// components/AmountInput.tsx
import { useState, useEffect } from 'react';
import { TextInput } from 'react-native';

/** Interpret a raw digit string as euro cents and render "1234" -> "12,34". */
export function formatDigitsAsAmount(digits: string): string {
  const clean = digits.replace(/\D/g, '');
  if (clean === '') return '';
  const padded = clean.padStart(3, '0');
  const euros = String(Number(padded.slice(0, -2))); // strips leading zeros
  const cents = padded.slice(-2);
  return `${euros},${cents}`;
}

function centsToDigits(cents: number): string {
  return cents > 0 ? String(cents) : '';
}

interface AmountInputProps {
  valueCents: number;
  onChangeCents: (cents: number) => void;
  placeholder?: string;
}

export function AmountInput({ valueCents, onChangeCents, placeholder = '0,00' }: AmountInputProps) {
  const [digits, setDigits] = useState(centsToDigits(valueCents));

  // Re-sync if the parent resets the value (e.g. category switch).
  useEffect(() => {
    setDigits(centsToDigits(valueCents));
  }, [valueCents]);

  const handleChange = (text: string) => {
    const next = text.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    setDigits(next);
    onChangeCents(next === '' ? 0 : Number(next));
  };

  return (
    <TextInput
      value={formatDigitsAsAmount(digits)}
      onChangeText={handleChange}
      keyboardType="number-pad"
      placeholder={placeholder}
      placeholderTextColor="#8e909a"
      style={{ color: '#e3e2e6', fontSize: 16 }}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest components/AmountInput.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/AmountInput.tsx components/AmountInput.test.ts
git commit -m "feat(components): shared cents-based AmountInput"
```

> Follow-up (out of scope, noted in spec): migrate manual-entry/confirm-receipt amount fields to `AmountInput` to close the Day 11.5 auto-decimal TODO.

---

## Task 5: Budget setup screen + Profile entry

**Files:**
- Create: `app/budgets.tsx`
- Modify: `app/(app)/profile.tsx` (add a "Manage budgets" navigation row)

**Interfaces:**
- Consumes: `useBudgetsStore`, `loadBudgets` from `@/features/budgets/store`; `upsertBudget`, `deleteBudget` from `@/features/budgets/api`; `resolveBudgetsForMonth` from `@/features/budgets/resolve`; `AmountInput` from `@/components/AmountInput`; `useTransactionsStore` (for `categories`); `firstOfMonth` from `@/lib/dates`; `useAuth`/household id from the existing auth hook (match how `import-dsk.tsx` obtains `householdId`); `FloatingActionBar`, `Screen`, `BackgroundGlow`.
- Produces: a route at `/budgets`.

- [ ] **Step 1: Read references**

Read `app/import-dsk.tsx` (non-tab screen layout, header, how it reads `householdId`) and `app/(app)/profile.tsx` (row styling, navigation) so this screen matches.

- [ ] **Step 2: Build the screen**

Behavior:
- On mount, ensure budgets are loaded (`if (!useBudgetsStore.getState().loaded) void loadBudgets(householdId)`).
- Build the editable list from `useTransactionsStore` `categories`. Seed each row's `valueCents` from `resolveBudgetsForMonth(rows, firstOfMonth())`.
- Local state: `draft: Record<categoryId, number>` (cents). Each row renders category icon + name + `AmountInput`.
- "Запази" (Save) via `FloatingActionBar` (single centered pill). On save: for each category, compare draft vs resolved-current-month; `amount>0` → `upsertBudget({..., month: firstOfMonth()})`, `amount===0` → `deleteBudget(...)` (only if a current-month row exists). After all writes, `await loadBudgets(householdId)`, then `router.back()`. Wrap in try/catch → `Alert.alert('Грешка', ...)` on failure; never crash.
- After the first successful save, call `ensureNotificationPermission()` from Task 7 if budget alerts are enabled (import lazily; this is the plan's "ask permission on first budget creation").

Header copy: "Бюджети". Empty categories list → fall back to a hint (shouldn't happen — defaults are seeded).

- [ ] **Step 3: Add the Profile entry row**

In `app/(app)/profile.tsx`, add a pressable row (matching the existing settings rows) labelled "Управление на бюджети" that does `router.push('/budgets')`. Place it near the budget-alerts toggle.

- [ ] **Step 4: Manual verification + typecheck**

Run: `npx tsc --noEmit` → no errors.
Then: `npx expo start`, open Profile → tap "Управление на бюджети" → set Groceries to `2,00`-style amount → Save → reopen the screen and confirm the value persisted (carried into the current month).

- [ ] **Step 5: Commit**

```bash
git add app/budgets.tsx "app/(app)/profile.tsx"
git commit -m "feat(budgets): budget setup screen + profile entry"
```

---

## Task 6: Budget-alerts preference (wire the existing toggle)

**Files:**
- Modify: `features/preferences/types.ts`
- Modify: `app/(app)/profile.tsx`

**Interfaces:**
- Consumes: `usePreferencesStore`, the preferences sync/upsert path (`features/preferences/sync.ts` / `api.ts`).
- Produces: `UserPreferences.budgetAlertsEnabled?: boolean` (default treated as `true` when absent); a Profile toggle wired to read/write it.

- [ ] **Step 1: Extend the type**

```ts
// features/preferences/types.ts — add to UserPreferences
export interface UserPreferences {
  version: 1;
  dashboardSections: DashboardSection[];
  budgetAlertsEnabled?: boolean; // default true when absent
}
```

- [ ] **Step 2: Wire the Profile toggle**

In `app/(app)/profile.tsx`, replace the local `useState(true)` for `budgetAlerts` with the preference value:

```tsx
const prefs = usePreferencesStore((s) => s.preferences);
const budgetAlerts = prefs.budgetAlertsEnabled ?? true;
const setBudgetAlerts = (value: boolean) => {
  // persist via the same path the layout sections use
  void updatePreferences({ ...prefs, budgetAlertsEnabled: value });
};
```

Use the existing preferences update/persist helper (find with `grep -rn "setPreferences\|upsertMyPreferences" features/preferences app | grep -v test` and reuse that flow — match how dashboard-section visibility is persisted today).

- [ ] **Step 3: Typecheck + manual check**

Run: `npx tsc --noEmit` → no errors.
Toggle the switch off, restart the app, confirm it stays off (persisted to `user_preferences`).

- [ ] **Step 4: Commit**

```bash
git add features/preferences/types.ts "app/(app)/profile.tsx"
git commit -m "feat(budgets): persist budget-alerts preference"
```

---

## Task 7: Notification wrapper + expo-notifications

**Files:**
- Create: `features/budgets/notify.ts`
- Modify: `package.json` / `app.json` (via `npx expo install`)

**Interfaces:**
- Produces:
  - `ensureNotificationPermission(): Promise<boolean>` — requests permission if undetermined; returns whether granted.
  - `sendBudgetNotification(input: { title: string; body: string }): Promise<void>` — fires an immediate local notification; best-effort (never throws).

- [ ] **Step 1: Install the dependency**

Run: `npx expo install expo-notifications`
Expected: adds `expo-notifications` to `package.json`. (Free dependency — allowed per Global Constraints.)

- [ ] **Step 2: Write the wrapper**

```ts
// features/budgets/notify.ts — the ONLY module that touches expo-notifications.
import * as Notifications from 'expo-notifications';

export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const req = await Notifications.requestPermissionsAsync();
    return req.granted;
  } catch {
    return false;
  }
}

export async function sendBudgetNotification(input: { title: string; body: string }): Promise<void> {
  try {
    const granted = await ensureNotificationPermission();
    if (!granted) return;
    await Notifications.scheduleNotificationAsync({
      content: { title: input.title, body: input.body },
      trigger: null, // immediate
    });
  } catch (err) {
    if (__DEV__) console.warn('[budgets] notify failed', err);
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add features/budgets/notify.ts package.json package-lock.json app.json
git commit -m "feat(budgets): local notification wrapper (expo-notifications)"
```

> On-device note: local notifications require the dev-client / preview build (Task call surfaces at runtime). Simulator behavior is covered by the on-device checkpoint, not unit tests.

---

## Task 8: Device-local dedup markers

**Files:**
- Create: `features/budgets/alertStore.ts`
- Test: `features/budgets/alertStore.test.ts` (pure key helper only)

**Interfaces:**
- Consumes: `AsyncStorage` from `@react-native-async-storage/async-storage`; `BudgetState` from `./types`.
- Produces:
  - `markerKey(householdId: string, categoryId: string, month: string, threshold: 80 | 100): string`
  - `hasAlerted(key: string): Promise<boolean>`
  - `recordAlerted(key: string): Promise<void>`

- [ ] **Step 1: Write the failing test for the key helper**

```ts
// features/budgets/alertStore.test.ts
import { markerKey } from './alertStore';

describe('markerKey', () => {
  it('is stable and includes household, category, month, threshold', () => {
    expect(markerKey('h1', 'groceries', '2026-06-01', 80)).toBe('budgetAlert:h1:groceries:2026-06-01:80');
  });
  it('differs by threshold', () => {
    expect(markerKey('h1', 'g', '2026-06-01', 80)).not.toBe(markerKey('h1', 'g', '2026-06-01', 100));
  });
  it('differs by month (resets monthly)', () => {
    expect(markerKey('h1', 'g', '2026-06-01', 80)).not.toBe(markerKey('h1', 'g', '2026-07-01', 80));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest features/budgets/alertStore.test.ts`
Expected: FAIL — cannot find module `./alertStore`.

- [ ] **Step 3: Implement**

```ts
// features/budgets/alertStore.ts — device-local dedup of budget alerts.
import AsyncStorage from '@react-native-async-storage/async-storage';

export function markerKey(
  householdId: string,
  categoryId: string,
  month: string,
  threshold: 80 | 100,
): string {
  return `budgetAlert:${householdId}:${categoryId}:${month}:${threshold}`;
}

export async function hasAlerted(key: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(key)) !== null;
  } catch {
    return false;
  }
}

export async function recordAlerted(key: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, '1');
  } catch {
    // best-effort; a missed marker only risks one duplicate notification
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest features/budgets/alertStore.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add features/budgets/alertStore.ts features/budgets/alertStore.test.ts
git commit -m "feat(budgets): device-local alert dedup markers"
```

---

## Task 9: runBudgetCheck (crossing + dedup) + wire into saves

**Files:**
- Create: `features/budgets/runBudgetCheck.ts`
- Test: `features/budgets/runBudgetCheck.test.ts`
- Modify: `app/manual-entry.tsx`, `app/confirm-receipt.tsx`

**Interfaces:**
- Consumes: `resolveBudgetsForMonth`, `budgetProgress`, `spendingByCategory` (from `@/features/transactions/dashboard`), `markerKey`/`hasAlerted`/`recordAlerted`, `sendBudgetNotification`, `formatCurrency`, category name lookup, `firstOfMonth`, `BudgetRow`, `Transaction`, `CategoryLite`.
- Produces:

```ts
export interface RunBudgetCheckInput {
  householdId: string;
  savedCategoryId: string | null;
  alertsEnabled: boolean;
  transactions: Transaction[];
  categories: CategoryLite[];
  budgets: BudgetRow[];
  now?: Date;
}
export interface RunBudgetCheckDeps {
  hasAlerted: typeof hasAlerted;
  recordAlerted: typeof recordAlerted;
  notify: typeof sendBudgetNotification;
}
export function runBudgetCheck(input: RunBudgetCheckInput, deps?: RunBudgetCheckDeps): Promise<void>;
```

Decision logic: skip if `!alertsEnabled` or `savedCategoryId === null`. Resolve current-month budgets; compute `budgetProgress` over `spendingByCategory(transactions, categories, now)`. Find the progress row for `savedCategoryId`. Determine the highest **crossed** threshold: `state === 'over'` → 100, `state === 'warning'` → 80, else none. For that threshold, if not `hasAlerted(markerKey(...))`, `notify(...)` then `recordAlerted(...)`. (If `over`, only the 100 marker is checked/fired — over implies past 80 but the 80 alert would have fired on the earlier save; we never double-notify.)

- [ ] **Step 1: Write the failing test**

```ts
// features/budgets/runBudgetCheck.test.ts
import { runBudgetCheck } from './runBudgetCheck';
import type { BudgetRow } from './types';
import type { Transaction } from '@/features/transactions/types';

const NOW = new Date('2026-06-15T12:00:00Z');
const cats = [{ id: 'groceries', name: 'Хранителни стоки', icon: 'shopping-cart', color: '#fff' }] as any;
const budget: BudgetRow = { id: 'b1', household_id: 'h1', category_id: 'groceries', amount_eur: 20000, month: '2026-06-01' };

function tx(amount: number): Transaction {
  return {
    id: Math.random().toString(), household_id: 'h1', user_id: 'u1', amount_eur: amount,
    original_amount: null, original_currency: null, merchant: 'Kaufland', category_id: 'groceries',
    date: '2026-06-10', note: null, source: 'manual', receipt_id: null, is_flagged: false,
    occurred_at: null, created_at: '2026-06-10T00:00:00Z',
  };
}

function makeDeps(alreadyAlerted = false) {
  return {
    hasAlerted: jest.fn().mockResolvedValue(alreadyAlerted),
    recordAlerted: jest.fn().mockResolvedValue(undefined),
    notify: jest.fn().mockResolvedValue(undefined),
  };
}

describe('runBudgetCheck', () => {
  it('does nothing when alerts are disabled', async () => {
    const deps = makeDeps();
    await runBudgetCheck({ householdId: 'h1', savedCategoryId: 'groceries', alertsEnabled: false, transactions: [tx(16000)], categories: cats, budgets: [budget], now: NOW }, deps);
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it('does nothing when below 80%', async () => {
    const deps = makeDeps();
    await runBudgetCheck({ householdId: 'h1', savedCategoryId: 'groceries', alertsEnabled: true, transactions: [tx(15999)], categories: cats, budgets: [budget], now: NOW }, deps);
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it('notifies and records when crossing 80%', async () => {
    const deps = makeDeps(false);
    await runBudgetCheck({ householdId: 'h1', savedCategoryId: 'groceries', alertsEnabled: true, transactions: [tx(16000)], categories: cats, budgets: [budget], now: NOW }, deps);
    expect(deps.notify).toHaveBeenCalledTimes(1);
    expect(deps.recordAlerted).toHaveBeenCalledWith('budgetAlert:h1:groceries:2026-06-01:80');
  });

  it('does not re-notify when the 80 marker already exists', async () => {
    const deps = makeDeps(true);
    await runBudgetCheck({ householdId: 'h1', savedCategoryId: 'groceries', alertsEnabled: true, transactions: [tx(16000)], categories: cats, budgets: [budget], now: NOW }, deps);
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it('fires the 100 threshold when over budget', async () => {
    const deps = makeDeps(false);
    await runBudgetCheck({ householdId: 'h1', savedCategoryId: 'groceries', alertsEnabled: true, transactions: [tx(20001)], categories: cats, budgets: [budget], now: NOW }, deps);
    expect(deps.recordAlerted).toHaveBeenCalledWith('budgetAlert:h1:groceries:2026-06-01:100');
  });

  it('does nothing for a category with no budget', async () => {
    const deps = makeDeps();
    await runBudgetCheck({ householdId: 'h1', savedCategoryId: 'groceries', alertsEnabled: true, transactions: [tx(16000)], categories: cats, budgets: [], now: NOW }, deps);
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it('never throws when a dep rejects', async () => {
    const deps = { hasAlerted: jest.fn().mockRejectedValue(new Error('x')), recordAlerted: jest.fn(), notify: jest.fn() };
    await expect(
      runBudgetCheck({ householdId: 'h1', savedCategoryId: 'groceries', alertsEnabled: true, transactions: [tx(16000)], categories: cats, budgets: [budget], now: NOW }, deps as any),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest features/budgets/runBudgetCheck.test.ts`
Expected: FAIL — cannot find module `./runBudgetCheck`.

- [ ] **Step 3: Implement**

```ts
// features/budgets/runBudgetCheck.ts
import type { Transaction } from '@/features/transactions/types';
import type { CategoryLite } from '@/features/transactions/groupByDay';
import { spendingByCategory } from '@/features/transactions/dashboard';
import { firstOfMonth } from '@/lib/dates';
import { formatCurrency } from '@/lib/formatCurrency';
import { resolveBudgetsForMonth } from './resolve';
import { budgetProgress } from './progress';
import { hasAlerted, markerKey, recordAlerted } from './alertStore';
import { sendBudgetNotification } from './notify';
import type { BudgetRow } from './types';

export interface RunBudgetCheckInput {
  householdId: string;
  savedCategoryId: string | null;
  alertsEnabled: boolean;
  transactions: Transaction[];
  categories: CategoryLite[];
  budgets: BudgetRow[];
  now?: Date;
}

export interface RunBudgetCheckDeps {
  hasAlerted: typeof hasAlerted;
  recordAlerted: typeof recordAlerted;
  notify: typeof sendBudgetNotification;
}

const defaultDeps: RunBudgetCheckDeps = { hasAlerted, recordAlerted, notify: sendBudgetNotification };

/**
 * After a save, fire a local notification if the saved transaction's category
 * just crossed 80% or 100% of its budget. Best-effort: never throws. Reads only
 * from in-memory inputs — no DB I/O.
 */
export async function runBudgetCheck(
  input: RunBudgetCheckInput,
  deps: RunBudgetCheckDeps = defaultDeps,
): Promise<void> {
  try {
    if (!input.alertsEnabled || input.savedCategoryId === null) return;
    const now = input.now ?? new Date();
    const month = firstOfMonth(now);
    const resolved = resolveBudgetsForMonth(input.budgets, month);
    const spend = spendingByCategory(input.transactions, input.categories, now);
    const rows = budgetProgress(resolved, spend);
    const row = rows.find((r) => r.categoryId === input.savedCategoryId);
    if (!row) return;

    const threshold: 80 | 100 | null = row.state === 'over' ? 100 : row.state === 'warning' ? 80 : null;
    if (threshold === null) return;

    const key = markerKey(input.householdId, input.savedCategoryId, month, threshold);
    if (await deps.hasAlerted(key)) return;

    const cat = input.categories.find((c) => c.id === input.savedCategoryId);
    const name = cat?.name ?? 'Категория';
    const title = threshold === 100 ? 'Бюджетът е надхвърлен' : 'Бюджетът наближава';
    const body = `${name} — ${formatCurrency(row.spentCents)} от ${formatCurrency(row.budgetCents)} (${row.pct}%)`;
    await deps.notify({ title, body });
    await deps.recordAlerted(key);
  } catch (err) {
    if (__DEV__) console.warn('[budgets] check failed', err);
  }
}
```

> Verify the exact `CategoryLite` import path (`@/features/transactions/groupByDay`) and `formatCurrency` signature (cents → `"€12,34"`) when implementing; adjust the imports if the project paths differ. The test mocks all three deps, so it does not touch AsyncStorage or expo-notifications.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest features/budgets/runBudgetCheck.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Wire into manual-entry**

In `app/manual-entry.tsx`, in the post-save best-effort block right after the `runDetection(...)` call (around line 167-174), add:

```ts
await runBudgetCheck({
  householdId,
  savedCategoryId: resolvedCategoryId,
  alertsEnabled: usePreferencesStore.getState().preferences.budgetAlertsEnabled ?? true,
  transactions: useTransactionsStore.getState().transactions,
  categories: useTransactionsStore.getState().categories,
  budgets: useBudgetsStore.getState().rows,
});
```

Add imports: `runBudgetCheck` from `@/features/budgets/runBudgetCheck`, `useBudgetsStore` from `@/features/budgets/store`, `usePreferencesStore` from `@/features/preferences/store`.

- [ ] **Step 6: Wire into confirm-receipt**

In `app/confirm-receipt.tsx`, after the `runDetection(...)` call (around line 145), add the same `runBudgetCheck({...})` block, using that screen's `resolvedCategoryId`/`householdId` variable names (read the file to match).

- [ ] **Step 7: Typecheck + full test run**

Run: `npx tsc --noEmit` → no errors.
Run: `npm test` → all suites pass.

- [ ] **Step 8: Commit**

```bash
git add features/budgets/runBudgetCheck.ts features/budgets/runBudgetCheck.test.ts app/manual-entry.tsx app/confirm-receipt.tsx
git commit -m "feat(budgets): 80%/over-budget local alert on save"
```

---

## Task 10: Dashboard budget progress bars

**Files:**
- Modify: `app/(app)/index.tsx`

**Interfaces:**
- Consumes: `useBudgetsStore`, `resolveBudgetsForMonth`, `budgetProgress`, the existing category-breakdown the dashboard already renders, `formatCurrency`, `firstOfMonth`.

- [ ] **Step 1: Read the dashboard category section**

Read `app/(app)/index.tsx` to find where the household-scoped category breakdown is rendered (the proportional `View` bars) and how a single category row is laid out.

- [ ] **Step 2: Overlay budget state on budgeted categories**

- Compute `const resolved = resolveBudgetsForMonth(useBudgetsStore((s) => s.rows), firstOfMonth());` and `const progress = budgetProgress(resolved, householdCategorySpend);` (household spend, ignoring the person toggle — use the household transaction set).
- Build a `Map<categoryId, BudgetProgress>`. For a category row that has a progress entry, render the bar fill width as `Math.min(pct, 100)%` and the label as `${formatCurrency(spentCents)} / ${formatCurrency(budgetCents)}`. Bar color: `under` → `#adc7ff` (primary-container), `warning` → `#ffdfa7` (tertiary, muted alert tone), `over` → `#ffb4ab` (error). Never `#c3f400`.
- Categories without a budget keep the existing proportional bar unchanged.

- [ ] **Step 3: Manual verification + typecheck**

Run: `npx tsc --noEmit` → no errors.
`npx expo start`: with a Groceries budget set and ~80% spent, the dashboard Groceries row shows `€160 / €200` and a tertiary-colored bar near full; an unbudgeted category looks unchanged.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/index.tsx"
git commit -m "feat(budgets): dashboard budget progress bars"
```

---

## Task 11: Insights "Budget vs Actual" section

**Files:**
- Modify: `app/(app)/insights.tsx`

**Interfaces:**
- Consumes: `useBudgetsStore`, `resolveBudgetsForMonth`, `budgetProgress`, current-month household spend, `formatCurrency`, `firstOfMonth`, category name/icon lookup, `SectionLabel`, `HairlineDivider`.

- [ ] **Step 1: Read the Insights screen**

Read `app/(app)/insights.tsx`, note the existing section pattern (e.g. category breakdown / AI summary) and where the Day 14 summary fixes scope to current-month household, so this section matches that convention.

- [ ] **Step 2: Add the section**

- Compute `progress` from `budgetProgress(resolveBudgetsForMonth(rows, firstOfMonth()), currentMonthHouseholdSpend)` — **fixed** to current month + household; the range/person pills do not rescope it.
- Render under a `SectionLabel` "Бюджет" (uppercase per design): one row per budgeted category showing icon + name, `formatCurrency(spentCents) / formatCurrency(budgetCents)`, remaining or overspend (`budget - spent`; if negative, show as overspend in `error` color), and the same colored progress bar from Task 10.
- If `progress.length === 0`, render a one-line hint: "Задай бюджети от Профил → Управление на бюджети." (links via plain text, no nav required).

- [ ] **Step 3: Manual verification + typecheck**

Run: `npx tsc --noEmit` → no errors.
`npx expo start`: Insights shows the Budget section with the Groceries row; changing the range/person pills does NOT change the budget section; with no budgets set it shows the hint.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/insights.tsx"
git commit -m "feat(budgets): insights budget vs actual section"
```

---

## Final verification

- [ ] Run full test suite: `npm test` → all pass (new: resolve, progress, AmountInput formatter, alertStore key, runBudgetCheck).
- [ ] `npx tsc --noEmit` → no errors.
- [ ] `npm run lint` → clean.
- [ ] On-device checkpoint (human): set a €200 Groceries budget; add transactions to reach €160; receive a local notification; dashboard shows the bar at 80%; Insights shows budget vs actual; next month the €200 budget still applies (carry-forward).
- [ ] Update `teftera-build-plan.md`: check off the Day 15 items; note Telegram + server push deferred and that budget alerting excludes DSK bulk import.

---

## Self-Review notes

- **Spec coverage:** setup from Profile (T5) · carry-forward read (T1) · dashboard bars (T10) · 80% local notification (T7–T9) · Telegram deferred (noted, no task) · insights budget vs actual (T11) · preference gate (T6) · zero DB I/O on save (T9 reads stores) · household-scoped (T9–T11) · unit tests for budget math (T1, T2, T8, T9). All spec sections map to a task.
- **Types:** `BudgetRow`/`ResolvedBudgets`/`BudgetProgress`/`BudgetState` defined in T1, consumed unchanged in T2/T9; `markerKey` threshold type `80 | 100` consistent across T8/T9; `RunBudgetCheckInput/Deps` defined and used identically in T9 test + impl.

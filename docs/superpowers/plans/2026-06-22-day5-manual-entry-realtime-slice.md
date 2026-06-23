# Day 5 — Manual Entry + Realtime Transaction List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the first real vertical slice — a manual transaction saves to Supabase, and both the history list and the dashboard total render live, day-grouped data that updates across devices via realtime.

**Architecture:** A new `features/transactions` data layer owns all Supabase IO (`api.ts`), a small Zustand store holds the loaded transactions + categories, and a single realtime subscription (`useTransactionsSync`, mounted in the `(app)` layout) refetches the store on any change. Screens stay dumb: they read the store and run **pure** mapping helpers (`groupByDay.ts`, `monthTotalCents`) that are unit-tested in isolation. Validation is a pure Zod parser (`schema.ts`). This mirrors the existing Day-4 pattern (`features/auth` store + `useAuthBootstrap` hook + `features/household/api.ts`).

**Tech Stack:** React Native + Expo Router, Supabase JS v2 (`postgres_changes` realtime), Zustand, Zod, Jest (jest-expo). All already installed.

## Global Constraints

- **Money = integers (euro-cents).** `amount_eur` is an integer cent count. Never float-arithmetic money. All display goes through `lib/formatCurrency.ts`. (copied from CLAUDE.md rule 1)
- **EUR only, no `$`.** Native currency is EUR; do not introduce USD or `$`. (rule 2)
- **`household_id` on every row, RLS enforced.** Every insert/select is scoped to the caller's household; the `transactions` RLS policy already enforces `is_household_member(household_id)`. (rule 3)
- **Schema changes = migration files.** The realtime publication change ships as a versioned SQL migration under `supabase/migrations`, never a dashboard edit. (rule 4)
- **TypeScript strict, no `any`, no plain `.js`.** (Conventions)
- **Conventional commits.** `feat:` / `test:` / `chore:` per task.
- **UI copy is Bulgarian (bg-BG).** Match the existing screens' Bulgarian labels.
- **Supabase access is centralized.** Only `features/transactions/api.ts` and `sync.ts` touch `supabase` for transactions; screens never call it directly. (mirrors `services/gemini.ts` / `features/household/api.ts` discipline)

**Reference signatures already in the repo (consume, do not redefine):**
- `lib/formatCurrency.ts`: `parseAmountToCents(input: string): number | null`, `formatCurrency(minorUnits: number): string`
- `lib/dates.ts`: `toISODate(d?: Date): string`, `relativeDay(iso: string, now?: Date): string`, `formatTime(d: Date): string`
- `lib/categories.ts`: `guessCategory(merchant: string): string`, type `MaterialIconName`
- `features/transactions/types.ts`: `Transaction`, `TransactionView`, `TransactionDayGroup`
- `features/auth/store.ts`: `useAuthStore` with `{ householdId: string | null, session: Session | null }`
- `services/supabase.ts`: `supabase` (single client export)

---

### Task 1: Pure lib helpers — `isValidISODate` + `resolveCategoryId`

**Files:**
- Modify: `lib/dates.ts`
- Modify: `lib/categories.ts`
- Test: `lib/dates.test.ts` (create)
- Test: `lib/categories.test.ts` (add cases)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `isValidISODate(iso: string): boolean` — true only for a real `YYYY-MM-DD` calendar date.
  - `resolveCategoryId(merchant: string, categories: ReadonlyArray<{ id: string; name: string }>): string | null` — maps a merchant to a seeded category id via `guessCategory`, falling back to the `Other` category, then `null`.

- [ ] **Step 1: Write the failing test for `isValidISODate`**

Create `lib/dates.test.ts`:

```ts
import { isValidISODate } from './dates';

describe('isValidISODate', () => {
  it('accepts a real date', () => {
    expect(isValidISODate('2026-06-22')).toBe(true);
  });

  it('rejects a malformed string', () => {
    expect(isValidISODate('2026-6-2')).toBe(false);
    expect(isValidISODate('not-a-date')).toBe(false);
    expect(isValidISODate('')).toBe(false);
  });

  it('rejects an impossible calendar date', () => {
    expect(isValidISODate('2026-02-30')).toBe(false);
    expect(isValidISODate('2026-13-01')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- lib/dates.test.ts`
Expected: FAIL — `isValidISODate is not a function`.

- [ ] **Step 3: Implement `isValidISODate`**

Append to `lib/dates.ts`:

```ts
/** True only for a syntactically and calendar-valid YYYY-MM-DD string. */
export function isValidISODate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return (
    date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
  );
}
```

- [ ] **Step 4: Run the date test to verify it passes**

Run: `npm test -- lib/dates.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for `resolveCategoryId`**

Add to `lib/categories.test.ts` inside a new describe block:

```ts
import { DEFAULT_CATEGORIES, guessCategory, resolveCategoryId } from './categories';

describe('resolveCategoryId', () => {
  const cats = [
    { id: 'cat-bev', name: 'Beverages' },
    { id: 'cat-gro', name: 'Groceries' },
    { id: 'cat-other', name: 'Other' },
  ];

  it('resolves a known merchant to its category id', () => {
    expect(resolveCategoryId('Starbucks Coffee', cats)).toBe('cat-bev');
    expect(resolveCategoryId('LIDL Sofia', cats)).toBe('cat-gro');
  });

  it('falls back to the Other category id when nothing matches', () => {
    expect(resolveCategoryId('Some Unknown Place', cats)).toBe('cat-other');
  });

  it('returns null when even Other is missing', () => {
    expect(resolveCategoryId('Whatever', [{ id: 'x', name: 'Beverages' }])).toBeNull();
  });
});
```

> Note: the existing top `import { DEFAULT_CATEGORIES, guessCategory } from './categories';` line already covers those names — extend it to also import `resolveCategoryId` rather than adding a duplicate import.

- [ ] **Step 6: Run it to verify it fails**

Run: `npm test -- lib/categories.test.ts`
Expected: FAIL — `resolveCategoryId is not a function`.

- [ ] **Step 7: Implement `resolveCategoryId`**

Append to `lib/categories.ts`:

```ts
/**
 * Map a merchant to a household category id by name. Uses `guessCategory`
 * for the rule match, then looks the resulting name up in the household's
 * seeded categories. Falls back to the household's `Other` category, then null.
 */
export function resolveCategoryId(
  merchant: string,
  categories: ReadonlyArray<{ id: string; name: string }>,
): string | null {
  const guessed = guessCategory(merchant);
  const match = categories.find((c) => c.name === guessed);
  if (match) return match.id;
  const other = categories.find((c) => c.name === 'Other');
  return other ? other.id : null;
}
```

- [ ] **Step 8: Run the full suite to verify green**

Run: `npm test`
Expected: PASS (all suites).

- [ ] **Step 9: Commit**

```bash
git add lib/dates.ts lib/dates.test.ts lib/categories.ts lib/categories.test.ts
git commit -m "feat(transactions): add isValidISODate and resolveCategoryId helpers"
```

---

### Task 2: Manual-entry Zod schema + parser

**Files:**
- Create: `features/transactions/schema.ts`
- Test: `features/transactions/schema.test.ts`

**Interfaces:**
- Consumes: `parseAmountToCents` (`lib/formatCurrency`), `isValidISODate` (`lib/dates`, Task 1).
- Produces:
  - `interface ManualEntryParsed { amountCents: number; merchant: string; note: string | null; date: string }`
  - `type ManualEntryErrors = { amount?: string; merchant?: string; date?: string }`
  - `parseManualEntry(values: { amount: string; merchant: string; note: string; date: string }): { success: true; data: ManualEntryParsed } | { success: false; errors: ManualEntryErrors }`

- [ ] **Step 1: Write the failing test**

Create `features/transactions/schema.test.ts`:

```ts
import { parseManualEntry } from './schema';

const base = { amount: '12,50', merchant: 'Billa', note: '', date: '2026-06-22' };

describe('parseManualEntry', () => {
  it('parses a valid entry to integer cents and trims fields', () => {
    const r = parseManualEntry({ ...base, merchant: '  Billa  ', note: '  lunch ' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual({
        amountCents: 1250,
        merchant: 'Billa',
        note: 'lunch',
        date: '2026-06-22',
      });
    }
  });

  it('maps an empty note to null', () => {
    const r = parseManualEntry({ ...base, note: '   ' });
    expect(r.success && r.data.note).toBeNull();
  });

  it('rejects a zero or negative amount', () => {
    const zero = parseManualEntry({ ...base, amount: '0' });
    const neg = parseManualEntry({ ...base, amount: '-5' });
    expect(zero.success).toBe(false);
    expect(neg.success).toBe(false);
    if (!zero.success) expect(zero.errors.amount).toBeTruthy();
  });

  it('rejects an unparseable amount', () => {
    const r = parseManualEntry({ ...base, amount: 'abc' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errors.amount).toBeTruthy();
  });

  it('rejects an empty merchant', () => {
    const r = parseManualEntry({ ...base, merchant: '   ' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errors.merchant).toBeTruthy();
  });

  it('rejects an invalid date', () => {
    const r = parseManualEntry({ ...base, date: '2026-02-30' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errors.date).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- features/transactions/schema.test.ts`
Expected: FAIL — cannot find module `./schema`.

- [ ] **Step 3: Implement the schema + parser**

Create `features/transactions/schema.ts`:

```ts
import { z } from 'zod';
import { parseAmountToCents } from '@/lib/formatCurrency';
import { isValidISODate } from '@/lib/dates';

export interface ManualEntryParsed {
  amountCents: number;
  merchant: string;
  note: string | null;
  date: string; // YYYY-MM-DD
}

export type ManualEntryErrors = {
  amount?: string;
  merchant?: string;
  date?: string;
};

const schema = z.object({
  amount: z
    .string()
    .refine((s) => {
      const cents = parseAmountToCents(s);
      return cents !== null && cents > 0;
    }, 'Въведи сума по-голяма от 0'),
  merchant: z.string().trim().min(1, 'Въведи търговец'),
  note: z.string(),
  date: z.string().refine(isValidISODate, 'Невалидна дата'),
});

/** Validate raw form strings; on success return integer-cents parsed data. */
export function parseManualEntry(values: {
  amount: string;
  merchant: string;
  note: string;
  date: string;
}):
  | { success: true; data: ManualEntryParsed }
  | { success: false; errors: ManualEntryErrors } {
  const result = schema.safeParse(values);
  if (!result.success) {
    const errors: ManualEntryErrors = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if (field === 'amount' && !errors.amount) errors.amount = issue.message;
      if (field === 'merchant' && !errors.merchant) errors.merchant = issue.message;
      if (field === 'date' && !errors.date) errors.date = issue.message;
    }
    return { success: false, errors };
  }
  const trimmedNote = result.data.note.trim();
  return {
    success: true,
    data: {
      // parseAmountToCents already validated non-null > 0 above.
      amountCents: parseAmountToCents(result.data.amount) as number,
      merchant: result.data.merchant.trim(),
      note: trimmedNote === '' ? null : trimmedNote,
      date: result.data.date,
    },
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- features/transactions/schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/transactions/schema.ts features/transactions/schema.test.ts
git commit -m "feat(transactions): zod manual-entry schema and parser"
```

---

### Task 3: Pure view-mapping — grouping + month total

**Files:**
- Create: `features/transactions/groupByDay.ts`
- Test: `features/transactions/groupByDay.test.ts`

**Interfaces:**
- Consumes: `Transaction`, `TransactionView`, `TransactionDayGroup` (`./types`); `relativeDay`, `formatTime` (`lib/dates`); `MaterialIconName` (`lib/categories`).
- Produces:
  - `interface CategoryLite { id: string; name: string; icon: string; color: string }`
  - `toTransactionView(tx: Transaction, byId: Map<string, CategoryLite>, now?: Date): TransactionView`
  - `groupTransactionsByDay(txs: Transaction[], categories: CategoryLite[], now?: Date): TransactionDayGroup[]`
  - `monthTotalCents(txs: Transaction[], now?: Date): number`

- [ ] **Step 1: Write the failing test**

Create `features/transactions/groupByDay.test.ts`:

```ts
import { groupTransactionsByDay, monthTotalCents, toTransactionView } from './groupByDay';
import type { Transaction } from './types';

const cats = [
  { id: 'c1', name: 'Groceries', icon: 'shopping-basket', color: '#adc7ff' },
  { id: 'c2', name: 'Beverages', icon: 'local-cafe', color: '#d8e3ff' },
];

function tx(p: Partial<Transaction>): Transaction {
  return {
    id: 'id',
    household_id: 'h',
    user_id: 'u',
    amount_eur: 1000,
    original_amount: null,
    original_currency: null,
    merchant: 'Test',
    category_id: 'c1',
    date: '2026-06-22',
    note: null,
    receipt_id: null,
    is_flagged: false,
    created_at: '2026-06-22T08:30:00.000Z',
    ...p,
  };
}

const NOW = new Date(2026, 5, 22); // 22 Jun 2026, local

describe('toTransactionView', () => {
  const byId = new Map(cats.map((c) => [c.id, c]));

  it('maps category icon, color and a "name • time" meta', () => {
    const v = toTransactionView(tx({ id: 'a', merchant: 'Billa' }), byId, NOW);
    expect(v.id).toBe('a');
    expect(v.merchant).toBe('Billa');
    expect(v.icon).toBe('shopping-basket');
    expect(v.iconColor).toBe('#adc7ff');
    expect(v.amountCents).toBe(1000);
    expect(v.meta.startsWith('Groceries')).toBe(true);
  });

  it('falls back to an Other-style glyph when category is missing', () => {
    const v = toTransactionView(tx({ id: 'b', category_id: null }), byId, NOW);
    expect(v.icon).toBe('category');
    expect(v.iconColor).toBe('#8e909a');
  });

  it('carries the flagged state through', () => {
    const v = toTransactionView(tx({ id: 'c', is_flagged: true }), byId, NOW);
    expect(v.isFlagged).toBe(true);
  });
});

describe('groupTransactionsByDay', () => {
  it('groups by date with a relative-day label, newest day first', () => {
    const groups = groupTransactionsByDay(
      [
        tx({ id: 'today', date: '2026-06-22' }),
        tx({ id: 'yest', date: '2026-06-21' }),
        tx({ id: 'today2', date: '2026-06-22' }),
      ],
      cats,
      NOW,
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe('Днес');
    expect(groups[0].items.map((i) => i.id)).toEqual(['today', 'today2']);
    expect(groups[1].label).toBe('Вчера');
  });

  it('returns an empty array for no transactions', () => {
    expect(groupTransactionsByDay([], cats, NOW)).toEqual([]);
  });
});

describe('monthTotalCents', () => {
  it('sums only the current calendar month', () => {
    const total = monthTotalCents(
      [
        tx({ id: '1', date: '2026-06-01', amount_eur: 500 }),
        tx({ id: '2', date: '2026-06-30', amount_eur: 1500 }),
        tx({ id: '3', date: '2026-05-31', amount_eur: 9999 }), // previous month, excluded
      ],
      NOW,
    );
    expect(total).toBe(2000);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- features/transactions/groupByDay.test.ts`
Expected: FAIL — cannot find module `./groupByDay`.

- [ ] **Step 3: Implement the mappers**

Create `features/transactions/groupByDay.ts`:

```ts
import { formatTime, relativeDay } from '@/lib/dates';
import type { MaterialIconName } from '@/lib/categories';
import type { Transaction, TransactionDayGroup, TransactionView } from './types';

export interface CategoryLite {
  id: string;
  name: string;
  icon: string;
  color: string;
}

const FALLBACK_ICON: MaterialIconName = 'category';
const FALLBACK_COLOR = '#8e909a';
const FALLBACK_NAME = 'Other';

/** Map one DB transaction to its presentational view, joining category data. */
export function toTransactionView(
  tx: Transaction,
  byId: Map<string, CategoryLite>,
  now: Date = new Date(),
): TransactionView {
  const cat = tx.category_id ? byId.get(tx.category_id) : undefined;
  const name = cat?.name ?? FALLBACK_NAME;
  const time = formatTime(new Date(tx.created_at));
  return {
    id: tx.id,
    merchant: tx.merchant,
    meta: `${name} • ${time}`,
    amountCents: tx.amount_eur,
    icon: (cat?.icon as MaterialIconName) ?? FALLBACK_ICON,
    iconColor: cat?.color ?? FALLBACK_COLOR,
    isFlagged: tx.is_flagged,
  };
}

/** Group transactions into day buckets, newest day first, preserving input order within a day. */
export function groupTransactionsByDay(
  txs: Transaction[],
  categories: CategoryLite[],
  now: Date = new Date(),
): TransactionDayGroup[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const sorted = [...txs].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1; // date desc
    return a.created_at < b.created_at ? 1 : -1; // newest first within a day
  });

  const groups: TransactionDayGroup[] = [];
  const indexByDate = new Map<string, number>();
  for (const tx of sorted) {
    let idx = indexByDate.get(tx.date);
    if (idx === undefined) {
      idx = groups.length;
      indexByDate.set(tx.date, idx);
      groups.push({ label: relativeDay(tx.date, now), items: [] });
    }
    groups[idx].items.push(toTransactionView(tx, byId, now));
  }
  return groups;
}

/** Sum of amount_eur (cents) for transactions in the current calendar month. */
export function monthTotalCents(txs: Transaction[], now: Date = new Date()): number {
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-`;
  return txs.reduce((sum, tx) => (tx.date.startsWith(prefix) ? sum + tx.amount_eur : sum), 0);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- features/transactions/groupByDay.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/transactions/groupByDay.ts features/transactions/groupByDay.test.ts
git commit -m "feat(transactions): pure day-grouping and month-total mappers"
```

---

### Task 4: Transactions data layer (Supabase IO)

**Files:**
- Create: `features/transactions/api.ts`

**Interfaces:**
- Consumes: `supabase` (`services/supabase`); `Transaction` (`./types`); `CategoryLite` (`./groupByDay`, Task 3).
- Produces:
  - `interface NewTransaction { householdId: string; userId: string | null; amountCents: number; merchant: string; categoryId: string | null; date: string; note: string | null }`
  - `listCategories(householdId: string): Promise<CategoryLite[]>`
  - `listTransactions(householdId: string): Promise<Transaction[]>`
  - `createTransaction(input: NewTransaction): Promise<void>`

> No unit test for this task — it is thin IO over Supabase, consistent with the untested `features/household/api.ts`. Its consumers (pure helpers, screens) are tested or manually verified. Correctness is checked at the typecheck + on-device steps.

- [ ] **Step 1: Implement the data layer**

Create `features/transactions/api.ts`:

```ts
// features/transactions/api.ts — the ONLY module that reads/writes transactions.
import { supabase } from '@/services/supabase';
import type { CategoryLite } from './groupByDay';
import type { Transaction } from './types';

export interface NewTransaction {
  householdId: string;
  userId: string | null;
  amountCents: number;
  merchant: string;
  categoryId: string | null;
  date: string; // YYYY-MM-DD
  note: string | null;
}

/** The household's categories, name-ascending. */
export async function listCategories(householdId: string): Promise<CategoryLite[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, icon, color')
    .eq('household_id', householdId)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CategoryLite[];
}

/** All transactions for a household, newest first. */
export async function listTransactions(householdId: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('household_id', householdId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Transaction[];
}

/** Insert one expense. EUR-native, so original_amount/currency stay null. */
export async function createTransaction(input: NewTransaction): Promise<void> {
  const { error } = await supabase.from('transactions').insert({
    household_id: input.householdId,
    user_id: input.userId,
    amount_eur: input.amountCents,
    original_amount: null,
    original_currency: null,
    merchant: input.merchant,
    category_id: input.categoryId,
    date: input.date,
    note: input.note,
  });
  if (error) throw error;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add features/transactions/api.ts
git commit -m "feat(transactions): supabase data layer for list and create"
```

---

### Task 5: Transactions store + realtime sync hook

**Files:**
- Create: `features/transactions/store.ts`
- Create: `features/transactions/sync.ts`
- Modify: `app/(app)/_layout.tsx`

**Interfaces:**
- Consumes: `listCategories`, `listTransactions` (`./api`, Task 4); `CategoryLite` (`./groupByDay`); `Transaction` (`./types`); `useAuthStore` (`features/auth/store`); `supabase` (`services/supabase`).
- Produces:
  - `useTransactionsStore` — Zustand store with `{ transactions: Transaction[]; categories: CategoryLite[]; loading: boolean; loaded: boolean }` plus `setData`, `setLoading`, `reset`.
  - `useTransactionsSync(): void` — loads the store and keeps it live; call once inside the `(app)` layout.

- [ ] **Step 1: Implement the store**

Create `features/transactions/store.ts`:

```ts
import { create } from 'zustand';
import type { CategoryLite } from './groupByDay';
import type { Transaction } from './types';

interface TransactionsState {
  transactions: Transaction[];
  categories: CategoryLite[];
  loading: boolean;
  loaded: boolean;
  setData: (transactions: Transaction[], categories: CategoryLite[]) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useTransactionsStore = create<TransactionsState>((set) => ({
  transactions: [],
  categories: [],
  loading: false,
  loaded: false,
  setData: (transactions, categories) =>
    set({ transactions, categories, loading: false, loaded: true }),
  setLoading: (loading) => set({ loading }),
  reset: () => set({ transactions: [], categories: [], loading: false, loaded: false }),
}));
```

- [ ] **Step 2: Implement the realtime sync hook**

Create `features/transactions/sync.ts`:

```ts
// features/transactions/sync.ts — single realtime subscription for the app.
import { useEffect } from 'react';
import { supabase } from '@/services/supabase';
import { useAuthStore } from '@/features/auth/store';
import { listCategories, listTransactions } from './api';
import { useTransactionsStore } from './store';

/**
 * Load the household's transactions + categories into the store and keep them
 * live. On any change to the household's transactions, refetch the list (we
 * trust RLS + a fresh query over decoding individual payloads — robust and
 * simple for a two-person household). Call once, in the (app) layout.
 */
export function useTransactionsSync(): void {
  const householdId = useAuthStore((s) => s.householdId);

  useEffect(() => {
    if (!householdId) {
      useTransactionsStore.getState().reset();
      return;
    }

    let active = true;
    const store = useTransactionsStore.getState();

    async function load() {
      try {
        const [categories, transactions] = await Promise.all([
          listCategories(householdId!),
          listTransactions(householdId!),
        ]);
        if (active) store.setData(transactions, categories);
      } catch (err) {
        if (__DEV__) console.warn('[transactions] load failed', err);
        if (active) store.setLoading(false);
      }
    }

    store.setLoading(true);
    load();

    const channel = supabase
      .channel(`transactions:${householdId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `household_id=eq.${householdId}`,
        },
        () => load(),
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [householdId]);
}
```

- [ ] **Step 3: Mount the hook in the (app) layout**

Modify `app/(app)/_layout.tsx` — add the import and call the hook before returning:

```tsx
import { Tabs } from 'expo-router';
import { BottomNav } from '@/components/BottomNav';
import { useTransactionsSync } from '@/features/transactions/sync';

/** Main app tab navigator with the floating frosted pill nav. */
export default function AppTabsLayout() {
  useTransactionsSync();

  return (
    <Tabs
      tabBar={(props) => <BottomNav {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: '#121316' } }}>
      <Tabs.Screen name="index" options={{ title: 'Начало' }} />
      <Tabs.Screen name="history" options={{ title: 'История' }} />
      <Tabs.Screen name="insights" options={{ title: 'Анализи' }} />
      <Tabs.Screen name="profile" options={{ title: 'Профил' }} />
    </Tabs>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/transactions/store.ts features/transactions/sync.ts "app/(app)/_layout.tsx"
git commit -m "feat(transactions): store and realtime sync mounted in app layout"
```

---

### Task 6: Enable realtime on the transactions table (migration)

**Files:**
- Create: `supabase/migrations/<timestamp>_realtime_transactions.sql`

**Interfaces:**
- Consumes: nothing. Produces: the `transactions` table published to `supabase_realtime` so `postgres_changes` fires.

- [ ] **Step 1: Generate the migration file**

Run: `npx supabase migration new realtime_transactions`
Expected: prints a new path `supabase/migrations/<timestamp>_realtime_transactions.sql`.

- [ ] **Step 2: Write the migration**

Put this in the new file:

```sql
-- Day 5: enable realtime change feed on transactions so both household
-- members see new rows without a refresh. Idempotent — safe to re-run.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'transactions'
  ) then
    alter publication supabase_realtime add table public.transactions;
  end if;
end $$;

-- Full row image on UPDATE/DELETE events (harmless; we refetch on change).
alter table public.transactions replica identity full;
```

- [ ] **Step 3: Push the migration to the remote project**

Run: `npx supabase db push`
Expected: applies `<timestamp>_realtime_transactions.sql` with no error. (If the CLI is not linked to project `kabevzkjocnrceqsdavw`, run `npx supabase link --project-ref kabevzkjocnrceqsdavw` first — this is a human-auth step; pause and ask the user if it prompts for a DB password.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations
git commit -m "feat(transactions): publish transactions table to realtime"
```

---

### Task 7: Wire the history screen to live data

**Files:**
- Modify: `app/(app)/history.tsx`

**Interfaces:**
- Consumes: `useTransactionsStore` (Task 5); `groupTransactionsByDay` (Task 3).
- Produces: a history screen rendering live, day-grouped data with loading + empty states. Removes `DEMO_GROUPS`.

- [ ] **Step 1: Replace the screen body**

Rewrite `app/(app)/history.tsx`:

```tsx
import { useMemo } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { Screen } from '@/components/Screen';
import { SectionLabel } from '@/components/SectionLabel';
import { TransactionRow } from '@/features/transactions/components/TransactionRow';
import { groupTransactionsByDay } from '@/features/transactions/groupByDay';
import { useTransactionsStore } from '@/features/transactions/store';

export default function HistoryScreen() {
  const transactions = useTransactionsStore((s) => s.transactions);
  const categories = useTransactionsStore((s) => s.categories);
  const loading = useTransactionsStore((s) => s.loading);
  const loaded = useTransactionsStore((s) => s.loaded);

  const groups = useMemo(
    () => groupTransactionsByDay(transactions, categories),
    [transactions, categories],
  );

  return (
    <Screen
      withTabBar
      floatingAboveTabBar={
        <FloatingActionBar
          actions={[
            { label: 'Филтри', icon: 'tune', variant: 'ghost' },
            { label: 'Търси', icon: 'search', variant: 'filled' },
          ]}
        />
      }>
      <Text className="mb-xl mt-md font-jakarta-semibold text-headline-xl text-on-surface">
        История
      </Text>

      {loading && !loaded ? (
        <View className="mt-xxl items-center">
          <ActivityIndicator color="#adc7ff" />
        </View>
      ) : groups.length === 0 ? (
        <View className="mt-xxl items-center px-6">
          <Text className="text-center font-inter text-body-lg text-on-surface-variant opacity-60">
            Все още няма транзакции. Добави първата с „Ръчно“ или „Сканирай“.
          </Text>
        </View>
      ) : (
        groups.map((group) => (
          <View key={group.label} className="mt-lg">
            <SectionLabel className="mb-sm">{group.label}</SectionLabel>
            {group.items.map((tx, i) => (
              <TransactionRow key={tx.id} tx={tx} showDivider={i < group.items.length - 1} />
            ))}
          </View>
        ))
      )}
    </Screen>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (and `TransactionDayGroup` import is gone — no unused-import error).

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/history.tsx"
git commit -m "feat(history): render live day-grouped transactions with loading and empty states"
```

---

### Task 8: Wire the dashboard total + recent list to live data

**Files:**
- Modify: `app/(app)/index.tsx`

**Interfaces:**
- Consumes: `useTransactionsStore` (Task 5); `monthTotalCents`, `toTransactionView` (Task 3); `TransactionRow`; `formatCurrency`.
- Produces: dashboard hero total computed from the current month, the recent-5 list rendered from live data, and a loading state on the hero. Removes `DEMO_ENTRIES`.

- [ ] **Step 1: Rewrite the dashboard**

Rewrite `app/(app)/index.tsx`:

```tsx
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { Screen } from '@/components/Screen';
import { SectionLabel } from '@/components/SectionLabel';
import { TransactionRow } from '@/features/transactions/components/TransactionRow';
import { monthTotalCents, toTransactionView } from '@/features/transactions/groupByDay';
import { useTransactionsStore } from '@/features/transactions/store';
import { formatCurrency } from '@/lib/formatCurrency';

export default function DashboardScreen() {
  const transactions = useTransactionsStore((s) => s.transactions);
  const categories = useTransactionsStore((s) => s.categories);
  const loaded = useTransactionsStore((s) => s.loaded);

  const total = useMemo(() => monthTotalCents(transactions), [transactions]);
  const recent = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    return transactions.slice(0, 5).map((tx) => toTransactionView(tx, byId));
  }, [transactions, categories]);

  return (
    <Screen
      withTabBar
      floatingAboveTabBar={
        <FloatingActionBar
          actions={[
            {
              label: 'Ръчно',
              icon: 'add',
              variant: 'ghost',
              onPress: () => router.navigate('/manual-entry'),
            },
            {
              label: 'Сканирай',
              icon: 'photo-camera',
              variant: 'filled',
              onPress: () => router.navigate('/scanner'),
            },
          ]}
        />
      }>
      {/* Top app bar */}
      <View className="mb-xl mt-md">
        <Text className="font-jakarta-bold text-headline-xl text-primary">Teftera</Text>
      </View>

      {/* Hero spending */}
      <View className="items-center py-xl">
        <SectionLabel>Месец</SectionLabel>
        {loaded ? (
          <Text
            className="mt-sm font-jakarta-semibold text-on-surface"
            style={{ fontSize: 80, lineHeight: 88 }}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}>
            {formatCurrency(total)}
          </Text>
        ) : (
          <View className="mt-lg h-20 justify-center">
            <ActivityIndicator color="#adc7ff" />
          </View>
        )}
      </View>

      {/* Recent entries */}
      <View className="mb-md flex-row items-center justify-between">
        <SectionLabel>Последни</SectionLabel>
        <Pressable
          onPress={() => router.navigate('/(app)/history')}
          className="flex-row items-center gap-1">
          <Text className="font-inter-semibold text-label-md text-primary">Виж всички</Text>
          <MaterialIcons name="chevron-right" size={16} color="#d8e3ff" />
        </Pressable>
      </View>

      {loaded && recent.length === 0 ? (
        <Text className="py-md font-inter text-body-md text-on-surface-variant opacity-60">
          Все още няма транзакции.
        </Text>
      ) : (
        recent.map((tx, i) => (
          <TransactionRow key={tx.id} tx={tx} showDivider={i < recent.length - 1} />
        ))
      )}
    </Screen>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (the old `HairlineDivider`, `ComponentProps`, `IconName` imports are gone with no unused-symbol errors).

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/index.tsx"
git commit -m "feat(dashboard): live month total and recent transactions"
```

---

### Task 9: Wire manual entry to save a real transaction

**Files:**
- Modify: `app/manual-entry.tsx`

**Interfaces:**
- Consumes: `parseManualEntry` (Task 2); `createTransaction` (Task 4); `resolveCategoryId`, `guessCategory` (`lib/categories`); `toISODate` (`lib/dates`); `useAuthStore`; `useTransactionsStore`.
- Produces: a working save flow — validate → resolve category → insert → return. Date is fixed to today; category is auto-resolved (pickers deferred to Day 6).

- [ ] **Step 1: Add imports + save state**

In `app/manual-entry.tsx`, extend the imports at the top:

```tsx
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackgroundGlow } from '@/components/BackgroundGlow';
import { HairlineDivider } from '@/components/HairlineDivider';
import { useAuthStore } from '@/features/auth/store';
import { createTransaction } from '@/features/transactions/api';
import { parseManualEntry } from '@/features/transactions/schema';
import { useTransactionsStore } from '@/features/transactions/store';
import { guessCategory, resolveCategoryId } from '@/lib/categories';
import { toISODate } from '@/lib/dates';
```

- [ ] **Step 2: Replace the component state + `onDone`**

Replace the `useState` block and the `onDone` stub (lines ~46–51) with:

```tsx
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; merchant?: string }>({});
  const [saving, setSaving] = useState(false);

  const onDone = async () => {
    if (saving) return;
    const parsed = parseManualEntry({ amount, merchant, note, date: toISODate() });
    if (!parsed.success) {
      setErrors({ amount: parsed.errors.amount, merchant: parsed.errors.merchant });
      return;
    }
    setErrors({});

    const { householdId, session } = useAuthStore.getState();
    if (!householdId) {
      Alert.alert('Грешка', 'Няма активно домакинство.');
      return;
    }
    const categories = useTransactionsStore.getState().categories;
    const categoryId = resolveCategoryId(parsed.data.merchant, categories);

    setSaving(true);
    try {
      await createTransaction({
        householdId,
        userId: session?.user.id ?? null,
        amountCents: parsed.data.amountCents,
        merchant: parsed.data.merchant,
        categoryId,
        date: parsed.data.date,
        note: parsed.data.note,
      });
      router.back(); // realtime sync refreshes the lists
    } catch {
      setSaving(false);
      Alert.alert('Грешка', 'Неуспешно записване. Опитай отново.');
    }
  };
```

- [ ] **Step 3: Show the saving state on the DONE button**

Replace the DONE `Pressable` (the one wrapping `ГОТОВО`) with:

```tsx
          <Pressable onPress={onDone} hitSlop={8} disabled={saving} className="px-2 py-1">
            {saving ? (
              <ActivityIndicator color="#adc7ff" />
            ) : (
              <Text className="font-inter-medium text-label-md text-primary-container">ГОТОВО</Text>
            )}
          </Pressable>
```

- [ ] **Step 4: Surface validation errors + live category, fix the date row**

Under the amount `TextInput` block, after its closing `</View>`, add an inline amount error:

```tsx
          {errors.amount ? (
            <Text className="-mt-12 mb-6 text-center font-inter text-body-md text-error">
              {errors.amount}
            </Text>
          ) : null}
```

In the `Търговец` `FieldRow`, add a merchant error line right after its `TextInput`:

```tsx
            {errors.merchant ? (
              <Text className="font-inter text-body-md text-error">{errors.merchant}</Text>
            ) : null}
```

Replace the `Категория` `FieldRow` body so it reflects the auto-resolved category (read-only for now — picker is Day 6):

```tsx
          <FieldRow label="Категория">
            <Text className="font-inter text-body-lg text-on-surface">
              {merchant.trim() ? guessCategory(merchant) : 'Автоматично'}
            </Text>
          </FieldRow>
```

Leave the `Дата` row showing `Днес` and remove its now-inert `chevron`/`onPress` (date is fixed to today this slice):

```tsx
          <FieldRow label="Дата">
            <Text className="font-inter text-body-lg text-on-surface">Днес</Text>
          </FieldRow>
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/manual-entry.tsx
git commit -m "feat(manual-entry): save a real transaction with zod validation and auto-category"
```

---

### Task 10: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full unit suite**

Run: `npm test`
Expected: PASS — all suites, including the new `lib/dates.test.ts`, `features/transactions/schema.test.ts`, `features/transactions/groupByDay.test.ts`, plus the existing ones.

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both PASS, no errors.

- [ ] **Step 3: On-device smoke test (human checkpoint)**

Run: `npx expo start` and on a device:
1. Open the app (signed in, household exists from Day 4).
2. Tap **Ръчно** → enter `12,50`, merchant `Billa`, note optional → **ГОТОВО**.
3. Expected: returns to the previous tab; the transaction appears under **Днес** in **История**; the dashboard **Месец** total includes it; the recent list shows it.
4. Validation: open **Ръчно**, leave amount `0` or merchant empty → **ГОТОВО** shows the inline error and does not save.

- [ ] **Step 4: Realtime two-device checkpoint (human, from build plan)**

With the second phone signed in as the other household member, add a transaction on device A. Expected: it appears on device B within a second or two **without** a manual refresh. (This is the build-plan Day 5 checkpoint and the human's final verification step.)

- [ ] **Step 5: Update the build plan**

Tick the Day 5 checklist items in `teftera-build-plan.md` (lines 66–73) and note the deferred pickers (date/category UI → Day 6). Commit:

```bash
git add teftera-build-plan.md
git commit -m "docs: mark Day 5 vertical slice complete"
```

---

## Self-Review Notes

- **Spec coverage:** manual entry saves real row (T4, T9) · Zod validation amount>0/merchant/date (T2, T9) · history reads grouped by date (T3, T7) · dashboard month total from real data (T3, T8) · realtime both users (T5, T6, T10 step 4) · loading states (T7, T8) · commit series ends at the Day-5 feature (all tasks). All seven checklist items map to tasks.
- **Deferred (called out, not silently dropped):** interactive category picker + date picker — not in the Day 5 checklist; the form auto-resolves category and fixes the date to today. Natural Day 6 add alongside transaction detail/edit.
- **Type consistency:** `CategoryLite` is defined once in `groupByDay.ts` and imported by `api.ts`, `store.ts`, `sync.ts`. `parseManualEntry`'s `{ success, data | errors }` shape is consumed exactly in T9. `NewTransaction` field names match `createTransaction`'s insert object and the DB columns in the initial-schema migration.
- **RLS/money/EUR constraints:** insert is household-scoped (RLS enforces membership); amounts stay integer cents end-to-end; no `$`/USD introduced; realtime is a migration, not a dashboard edit.

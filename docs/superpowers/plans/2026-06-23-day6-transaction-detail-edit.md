# Day 6 — Transaction Detail, Edit/Delete, Pickers & Empty States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a transaction inspectable (read-only detail screen), editable (the manual-entry form generalized into create/edit with real category + date pickers), and deletable, plus add shared empty states across History, Dashboard, and Insights.

**Architecture:** Detail and edit read the transaction from the existing realtime `useTransactionsStore` by id (no fetch). Editing reuses `app/manual-entry.tsx` as one create/edit form keyed on an `id` route param. Two new presentational components (`CategoryPickerModal`, `DateField`) and one shared `EmptyState` keep the screens thin. Pure prefill/normalization helpers live in `features/transactions/edit.ts` and are unit-tested; Supabase mutations join the existing `features/transactions/api.ts`.

**Tech Stack:** React Native + Expo Router, Supabase JS v2, Zustand, Zod, Jest, `@react-native-community/datetimepicker` (new, free, Expo Go compatible).

**Spec:** `docs/superpowers/specs/2026-06-23-day6-transaction-detail-edit-design.md`

## Global Constraints

- **Money = integer euro-cents.** Storage/transport is integer `amount_eur`. The only `/100` is **display formatting** of an already-stored value (same as `formatCurrency`); the save path re-parses via `parseAmountToCents` (integer round). Never float-arithmetic money for storage. (CLAUDE.md rule 1)
- **EUR only, no `$`.** (rule 2)
- **`household_id` + RLS on every query.** `update`/`delete` filter by `id`; the `transactions` RLS policy still scopes to the caller's household. (rule 3)
- **All Supabase transaction IO stays in `features/transactions/api.ts` / `sync.ts`.** Screens never call `supabase` directly.
- **TypeScript strict, no `any`, no plain `.js`.** Project also has `noUncheckedIndexedAccess: true` — guard destructured/indexed access (run `npm run typecheck`, not just `npm test`, since jest transpiles without type-checking).
- **UI copy is Bulgarian (bg-BG).**
- **Conventional commits.**
- **Free deps only** — `@react-native-community/datetimepicker` via `expo install` (free, agreed in the spec).

**Reference signatures already in the repo (consume, do not redefine):**
- `features/transactions/types.ts`: `Transaction` (`id, household_id, user_id, amount_eur, original_amount, original_currency, merchant, category_id, date, note, receipt_id, is_flagged, created_at`).
- `features/transactions/store.ts`: `useTransactionsStore` (`transactions: Transaction[]`, `categories: CategoryLite[]`, `loading`, `loaded`).
- `features/transactions/groupByDay.ts`: type `CategoryLite { id; name; icon; color }`.
- `features/transactions/api.ts`: `createTransaction(NewTransaction)`.
- `features/transactions/sync.ts`: `refreshTransactions(householdId: string): Promise<void>`.
- `features/transactions/schema.ts`: `parseManualEntry({amount,merchant,note,date})`.
- `features/household/api.ts`: `getMembers(householdId): Promise<HouseholdMember[]>`, `HouseholdMember { userId; displayName; role }`.
- `lib/categories.ts`: `guessCategory`, `resolveCategoryId`, type `MaterialIconName`.
- `lib/dates.ts`: `toISODate(d?)`, `relativeDay(iso, now?)`.
- `lib/formatCurrency.ts`: `formatCurrency`, `parseAmountToCents`.
- `features/auth/store.ts`: `useAuthStore` (`householdId`, `session`).
- `components/`: `BackgroundGlow`, `HairlineDivider`, `Screen`, `SectionLabel`, `FloatingActionBar`.

---

### Task 1: Pure prefill/normalization helpers (`edit.ts`)

**Files:**
- Create: `features/transactions/edit.ts`
- Test: `features/transactions/edit.test.ts`

**Interfaces:**
- Consumes: `Transaction` (`./types`).
- Produces:
  - `interface ManualEntryFormValues { amount: string; merchant: string; note: string; date: string; categoryId: string | null }`
  - `transactionToFormValues(tx: Transaction): ManualEntryFormValues`
  - `memberName(userId: string | null, members: ReadonlyArray<{ userId: string; displayName: string }>): string`

- [ ] **Step 1: Write the failing test**

Create `features/transactions/edit.test.ts`:

```ts
import { memberName, transactionToFormValues } from './edit';
import type { Transaction } from './types';

function tx(p: Partial<Transaction>): Transaction {
  return {
    id: 'id', household_id: 'h', user_id: 'u', amount_eur: 1250,
    original_amount: null, original_currency: null, merchant: 'Billa',
    category_id: 'c1', date: '2026-06-22', note: 'lunch', receipt_id: null,
    is_flagged: false, created_at: '2026-06-22T08:30:00.000Z', ...p,
  };
}

describe('transactionToFormValues', () => {
  it('formats cents as a comma-decimal major string and passes fields through', () => {
    expect(transactionToFormValues(tx({}))).toEqual({
      amount: '12,50', merchant: 'Billa', note: 'lunch',
      date: '2026-06-22', categoryId: 'c1',
    });
  });

  it('maps a null note to an empty string', () => {
    expect(transactionToFormValues(tx({ note: null })).note).toBe('');
  });

  it('keeps a null category id', () => {
    expect(transactionToFormValues(tx({ category_id: null })).categoryId).toBeNull();
  });

  it('formats larger amounts without grouping separators', () => {
    expect(transactionToFormValues(tx({ amount_eur: 100000 })).amount).toBe('1000,00');
  });
});

describe('memberName', () => {
  const members = [
    { userId: 'u1', displayName: 'Радо' },
    { userId: 'u2', displayName: 'Мария' },
  ];

  it('returns the matching member display name', () => {
    expect(memberName('u2', members)).toBe('Мария');
  });

  it('returns Импорт for a null user id', () => {
    expect(memberName(null, members)).toBe('Импорт');
  });

  it('returns a dash for an unknown user id', () => {
    expect(memberName('ghost', members)).toBe('—');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- features/transactions/edit.test.ts`
Expected: FAIL — cannot find module `./edit`.

- [ ] **Step 3: Implement the helpers**

Create `features/transactions/edit.ts`:

```ts
import type { Transaction } from './types';

export interface ManualEntryFormValues {
  amount: string; // major-unit string for the amount input, e.g. "12,50"
  merchant: string;
  note: string; // '' when none
  date: string; // YYYY-MM-DD
  categoryId: string | null;
}

/**
 * Map a stored transaction to prefilled create/edit form values.
 * `amount` is display formatting of an already-stored integer (mirrors
 * formatCurrency's /100); the save path re-parses it to integer cents.
 */
export function transactionToFormValues(tx: Transaction): ManualEntryFormValues {
  return {
    amount: (tx.amount_eur / 100).toFixed(2).replace('.', ','),
    merchant: tx.merchant,
    note: tx.note ?? '',
    date: tx.date,
    categoryId: tx.category_id,
  };
}

/** Resolve a member display name from a user id; null id -> 'Импорт', unknown -> '—'. */
export function memberName(
  userId: string | null,
  members: ReadonlyArray<{ userId: string; displayName: string }>,
): string {
  if (userId === null) return 'Импорт';
  const match = members.find((m) => m.userId === userId);
  return match ? match.displayName : '—';
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- features/transactions/edit.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
Expected: 0 errors.

```bash
git add features/transactions/edit.ts features/transactions/edit.test.ts
git commit -m "feat(transactions): prefill + member-name helpers for edit/detail"
```

---

### Task 2: Update + delete data layer

**Files:**
- Modify: `features/transactions/api.ts`

**Interfaces:**
- Consumes: `supabase` (`@/services/supabase`).
- Produces:
  - `interface TransactionPatch { amountCents: number; merchant: string; categoryId: string | null; date: string; note: string | null }`
  - `updateTransaction(id: string, patch: TransactionPatch): Promise<void>`
  - `deleteTransaction(id: string): Promise<void>`

> No unit test — thin Supabase IO, consistent with the rest of `api.ts`. Gate is `npm run typecheck`.

- [ ] **Step 1: Append the two functions to `features/transactions/api.ts`**

Add at the end of the file (after `createTransaction`):

```ts
export interface TransactionPatch {
  amountCents: number;
  merchant: string;
  categoryId: string | null;
  date: string; // YYYY-MM-DD
  note: string | null;
}

/** Update an existing transaction's editable fields. RLS scopes by household. */
export async function updateTransaction(id: string, patch: TransactionPatch): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .update({
      amount_eur: patch.amountCents,
      merchant: patch.merchant,
      category_id: patch.categoryId,
      date: patch.date,
      note: patch.note,
    })
    .eq('id', id);
  if (error) throw error;
}

/** Delete a transaction by id. RLS scopes by household. */
export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add features/transactions/api.ts
git commit -m "feat(transactions): updateTransaction and deleteTransaction"
```

---

### Task 3: Shared `EmptyState` + wire History, Dashboard, Insights

**Files:**
- Create: `components/EmptyState.tsx`
- Modify: `app/(app)/history.tsx`, `app/(app)/index.tsx`, `app/(app)/insights.tsx`

**Interfaces:**
- Consumes: `MaterialIconName` (`@/lib/categories`); `useTransactionsStore`.
- Produces: `EmptyState({ icon, title, message?, cta? })` where `cta?: { label: string; onPress: () => void }`.

> No unit test (presentational + screen wiring). Gate: `npm run typecheck` + `npm run lint`.

- [ ] **Step 1: Create `components/EmptyState.tsx`**

```tsx
import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import type { MaterialIconName } from '@/lib/categories';

interface EmptyStateProps {
  icon: MaterialIconName;
  title: string;
  message?: string;
  cta?: { label: string; onPress: () => void };
}

/** Centered empty-state block: icon + title + optional message + optional pill CTA. */
export function EmptyState({ icon, title, message, cta }: EmptyStateProps) {
  return (
    <View className="items-center px-8 py-xxl">
      <View className="mb-md h-16 w-16 items-center justify-center rounded-full bg-surface-container">
        <MaterialIcons name={icon} size={28} color="#8e909a" />
      </View>
      <Text className="text-center font-jakarta-semibold text-headline-md text-on-surface">
        {title}
      </Text>
      {message ? (
        <Text className="mt-2 text-center font-inter text-body-md text-on-surface-variant opacity-70">
          {message}
        </Text>
      ) : null}
      {cta ? (
        <Pressable
          onPress={cta.onPress}
          className="mt-lg rounded-full border border-primary-container px-6 py-2 active:bg-primary-container/10">
          <Text className="font-inter text-label-md text-primary-container">{cta.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 2: Use it in `app/(app)/history.tsx`**

Replace the empty branch. Change the import block to add `router` and `EmptyState`, and swap the empty `<View>`. The empty branch currently is:

```tsx
      ) : groups.length === 0 ? (
        <View className="mt-xxl items-center px-6">
          <Text className="text-center font-inter text-body-lg text-on-surface-variant opacity-60">
            Все още няма транзакции. Добави първата с „Ръчно“ или „Сканирай“.
          </Text>
        </View>
      ) : (
```

Replace that empty branch with:

```tsx
      ) : groups.length === 0 ? (
        <EmptyState
          icon="receipt-long"
          title="Все още няма транзакции"
          message={'Добави първата с „Ръчно" или „Сканирай".'}
          cta={{ label: 'Ръчно', onPress: () => router.navigate('/manual-entry') }}
        />
      ) : (
```

Add the imports at the top of `history.tsx` (alongside the existing ones):

```tsx
import { router } from 'expo-router';
import { EmptyState } from '@/components/EmptyState';
```

Remove the now-unused `ActivityIndicator`? No — it is still used for the loading branch. Keep it.

- [ ] **Step 3: Use it in `app/(app)/index.tsx` (Dashboard recent)**

The current empty-recent branch is:

```tsx
      {loaded && recent.length === 0 ? (
        <Text className="py-md font-inter text-body-md text-on-surface-variant opacity-60">
          Все още няма транзакции.
        </Text>
      ) : (
```

Replace it with:

```tsx
      {loaded && recent.length === 0 ? (
        <EmptyState icon="receipt-long" title="Все още няма транзакции" />
      ) : (
```

Add the import at the top of `index.tsx`:

```tsx
import { EmptyState } from '@/components/EmptyState';
```

- [ ] **Step 4: Gate `app/(app)/insights.tsx` on real transaction count**

At the top of `insights.tsx`, add imports:

```tsx
import { EmptyState } from '@/components/EmptyState';
import { useTransactionsStore } from '@/features/transactions/store';
```

Inside `InsightsScreen`, before the `return`, read the count and short-circuit. Replace the function body opening:

```tsx
export default function InsightsScreen() {
  const hasData = useTransactionsStore((s) => s.transactions.length > 0);

  return (
    <Screen
      withTabBar
      floatingAboveTabBar={
        <FloatingActionBar
          actions={[
            { label: 'Филтри', icon: 'filter-list', variant: 'ghost' },
            { label: 'Сравни', icon: 'compare-arrows', variant: 'filled' },
          ]}
        />
      }>
      <Text className="mb-xl mt-md font-jakarta-semibold text-headline-xl text-on-surface">
        Анализи
      </Text>

      {!hasData ? (
        <EmptyState
          icon="insights"
          title="Няма данни за анализ"
          message="Добави транзакции, за да видиш разбивки и тенденции."
        />
      ) : (
        <>
          {/* ===== existing content from "Hero total" through "Anomalies" goes here, unchanged ===== */}
        </>
      )}
    </Screen>
  );
}
```

Move the existing JSX (the `Hero total` block through the end of the `Anomalies` block — everything that currently sits between the `Анализи` heading and the closing `</Screen>`) inside the `<>...</>` of the `hasData` branch. Do not change that markup; only wrap it. The static `CATEGORIES`/`TREND`/`MERCHANTS`/`ANOMALIES` constants stay as-is (still the demo until Day 12).

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass. (If a Bulgarian string in raw JSX text trips `react/no-unescaped-entities` from typographic quotes „ ", wrap that string in `{'...'}` — displayed text byte-identical. The History `message` above is already wrapped for this reason.)

- [ ] **Step 6: Commit**

```bash
git add components/EmptyState.tsx "app/(app)/history.tsx" "app/(app)/index.tsx" "app/(app)/insights.tsx"
git commit -m "feat(ui): shared EmptyState across history, dashboard, and insights"
```

---

### Task 4: Date picker dependency + `DateField`

**Files:**
- Create: `features/transactions/components/DateField.tsx`
- Modify: `package.json` (via `expo install`)

**Interfaces:**
- Consumes: `relativeDay`, `toISODate` (`@/lib/dates`); `HairlineDivider`.
- Produces: `DateField({ value: string /* ISO YYYY-MM-DD */, onChange: (iso: string) => void, label?: string })`

> No unit test (native UI component). Gate: `npm run typecheck` + `npm run lint`.

- [ ] **Step 1: Install the dependency**

Run: `npx expo install @react-native-community/datetimepicker`
Expected: adds the package to `package.json` dependencies at the Expo-pinned version.

- [ ] **Step 2: Create `features/transactions/components/DateField.tsx`**

```tsx
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HairlineDivider } from '@/components/HairlineDivider';
import { relativeDay, toISODate } from '@/lib/dates';

interface DateFieldProps {
  value: string; // YYYY-MM-DD
  onChange: (iso: string) => void;
  label?: string;
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** A "Дата" row that opens the native date picker. Defaults label to „Дата". */
export function DateField({ value, onChange, label = 'Дата' }: DateFieldProps) {
  const [open, setOpen] = useState(false);

  return (
    <View>
      <Pressable onPress={() => setOpen(true)} className="active:bg-white/5">
        <View className="flex-row items-center justify-between px-6 py-5">
          <View className="flex-1 gap-1">
            <Text className="font-inter-medium text-label-md uppercase text-on-surface-variant opacity-60">
              {label}
            </Text>
            <Text className="font-inter text-body-lg text-on-surface">{relativeDay(value)}</Text>
          </View>
          <MaterialIcons name="event" size={22} color="#c4c6d0" />
        </View>
      </Pressable>
      <HairlineDivider />

      {open && Platform.OS === 'android' ? (
        <DateTimePicker
          value={parseISO(value)}
          mode="date"
          onChange={(event, selected) => {
            setOpen(false);
            if (event.type === 'set' && selected) onChange(toISODate(selected));
          }}
        />
      ) : null}

      {open && Platform.OS !== 'android' ? (
        <Modal visible transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <Pressable className="flex-1 justify-end bg-black/50" onPress={() => setOpen(false)}>
            <Pressable className="rounded-t-3xl bg-surface-container" onPress={() => {}}>
              <SafeAreaView edges={['bottom']}>
                <View className="flex-row justify-end px-6 py-3">
                  <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                    <Text className="font-inter-medium text-label-md text-primary-container">Готово</Text>
                  </Pressable>
                </View>
                <DateTimePicker
                  value={parseISO(value)}
                  mode="date"
                  display="spinner"
                  themeVariant="dark"
                  onChange={(_event, selected) => {
                    if (selected) onChange(toISODate(selected));
                  }}
                />
              </SafeAreaView>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json features/transactions/components/DateField.tsx
git commit -m "feat(transactions): native DateField picker"
```

---

### Task 5: `CategoryPickerModal`

**Files:**
- Create: `features/transactions/components/CategoryPickerModal.tsx`

**Interfaces:**
- Consumes: `CategoryLite` (`@/features/transactions/groupByDay`); `MaterialIconName` (`@/lib/categories`).
- Produces: `CategoryPickerModal({ visible, categories, selectedId, onSelect, onClose })` where `categories: CategoryLite[]`, `selectedId: string | null`, `onSelect: (id: string) => void`, `onClose: () => void`.

> No unit test (presentational). Gate: `npm run typecheck` + `npm run lint`.

- [ ] **Step 1: Create `features/transactions/components/CategoryPickerModal.tsx`**

```tsx
import { MaterialIcons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CategoryLite } from '@/features/transactions/groupByDay';
import type { MaterialIconName } from '@/lib/categories';

interface CategoryPickerModalProps {
  visible: boolean;
  categories: CategoryLite[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

/** Bottom-sheet modal listing the household's categories; controlled select. */
export function CategoryPickerModal({
  visible,
  categories,
  selectedId,
  onSelect,
  onClose,
}: CategoryPickerModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
        <Pressable className="rounded-t-3xl bg-surface-container" onPress={() => {}}>
          <SafeAreaView edges={['bottom']}>
            <View className="items-center py-2">
              <View className="h-1 w-10 rounded-full bg-outline" />
            </View>
            <Text className="px-6 py-3 font-jakarta-semibold text-headline-md text-on-surface">
              Категория
            </Text>
            <ScrollView className="max-h-96">
              {categories.map((c) => {
                const active = c.id === selectedId;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => onSelect(c.id)}
                    className="flex-row items-center gap-md px-6 py-3 active:bg-white/5">
                    <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-container-high">
                      <MaterialIcons name={c.icon as MaterialIconName} size={20} color={c.color} />
                    </View>
                    <Text className="flex-1 font-inter text-body-lg text-on-surface">{c.name}</Text>
                    {active ? <MaterialIcons name="check" size={22} color="#adc7ff" /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add features/transactions/components/CategoryPickerModal.tsx
git commit -m "feat(transactions): category picker modal"
```

---

### Task 6: Generalize `manual-entry` into a create/edit form

**Files:**
- Modify: `app/manual-entry.tsx` (full rewrite — see below)

**Interfaces:**
- Consumes: `transactionToFormValues` (Task 1); `updateTransaction` (Task 2); `DateField` (Task 4); `CategoryPickerModal` (Task 5); existing `createTransaction`, `refreshTransactions`, `parseManualEntry`, `useTransactionsStore`, `useAuthStore`, `guessCategory`, `resolveCategoryId`, `toISODate`.
- Produces: the `/manual-entry` route now accepts an optional `?id=<txid>` param (edit mode).

- [ ] **Step 1: Rewrite `app/manual-entry.tsx`**

```tsx
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackgroundGlow } from '@/components/BackgroundGlow';
import { HairlineDivider } from '@/components/HairlineDivider';
import { useAuthStore } from '@/features/auth/store';
import { createTransaction, updateTransaction } from '@/features/transactions/api';
import { CategoryPickerModal } from '@/features/transactions/components/CategoryPickerModal';
import { DateField } from '@/features/transactions/components/DateField';
import { transactionToFormValues } from '@/features/transactions/edit';
import { parseManualEntry } from '@/features/transactions/schema';
import { useTransactionsStore } from '@/features/transactions/store';
import { refreshTransactions } from '@/features/transactions/sync';
import { guessCategory, resolveCategoryId } from '@/lib/categories';
import { toISODate } from '@/lib/dates';

function FieldRow({
  label,
  children,
  onPress,
  chevron,
}: {
  label: string;
  children: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
}) {
  const Body = (
    <View className="flex-row items-center justify-between px-6 py-5">
      <View className="flex-1 gap-1">
        <Text className="font-inter-medium text-label-md uppercase text-on-surface-variant opacity-60">
          {label}
        </Text>
        {children}
      </View>
      {chevron ? <MaterialIcons name="expand-more" size={22} color="#c4c6d0" /> : null}
    </View>
  );
  return (
    <View>
      {onPress ? (
        <Pressable onPress={onPress} className="active:bg-white/5">
          {Body}
        </Pressable>
      ) : (
        Body
      )}
      <HairlineDivider />
    </View>
  );
}

export default function ManualEntryScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;
  const categories = useTransactionsStore((s) => s.categories);
  const existing = useTransactionsStore((s) =>
    id ? s.transactions.find((t) => t.id === id) : undefined,
  );

  const seed = useMemo(
    () => (existing ? transactionToFormValues(existing) : null),
    [existing],
  );

  const [amount, setAmount] = useState(seed?.amount ?? '');
  const [merchant, setMerchant] = useState(seed?.merchant ?? '');
  const [note, setNote] = useState(seed?.note ?? '');
  const [date, setDate] = useState(seed?.date ?? toISODate());
  const [categoryId, setCategoryId] = useState<string | null>(seed?.categoryId ?? null);
  const [categoryTouched, setCategoryTouched] = useState(isEdit);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [errors, setErrors] = useState<{ amount?: string; merchant?: string }>({});
  const [saving, setSaving] = useState(false);

  // Edit mode but the transaction is gone (deleted on another device).
  if (isEdit && !existing) {
    return (
      <View className="flex-1 bg-background">
        <BackgroundGlow />
        <SafeAreaView className="flex-1 items-center justify-center px-8" edges={['top']}>
          <Text className="text-center font-inter text-body-lg text-on-surface-variant">
            Транзакцията не е намерена.
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="mt-lg rounded-full border border-primary-container px-6 py-2">
            <Text className="font-inter text-label-md text-primary-container">Назад</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  const selectedCategory = categoryId ? categories.find((c) => c.id === categoryId) : undefined;
  const categoryLabel = selectedCategory
    ? selectedCategory.name
    : merchant.trim() && !categoryTouched
      ? guessCategory(merchant)
      : 'Автоматично';

  const onSave = async () => {
    if (saving) return;
    const parsed = parseManualEntry({ amount, merchant, note, date });
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
    const resolvedCategoryId = categoryTouched
      ? categoryId
      : resolveCategoryId(parsed.data.merchant, categories);

    setSaving(true);
    try {
      if (isEdit && id) {
        await updateTransaction(id, {
          amountCents: parsed.data.amountCents,
          merchant: parsed.data.merchant,
          categoryId: resolvedCategoryId,
          date: parsed.data.date,
          note: parsed.data.note,
        });
      } else {
        await createTransaction({
          householdId,
          userId: session?.user.id ?? null,
          amountCents: parsed.data.amountCents,
          merchant: parsed.data.merchant,
          categoryId: resolvedCategoryId,
          date: parsed.data.date,
          note: parsed.data.note,
        });
      }
      await refreshTransactions(householdId);
      router.back();
    } catch {
      setSaving(false);
      Alert.alert(
        'Грешка',
        isEdit ? 'Неуспешна редакция. Опитай отново.' : 'Неуспешно записване. Опитай отново.',
      );
    }
  };

  return (
    <View className="flex-1 bg-background">
      <BackgroundGlow />
      <SafeAreaView className="flex-1" edges={['top']}>
        {/* Top app bar */}
        <View className="flex-row items-center justify-between px-6 py-4">
          <Pressable onPress={() => router.back()} hitSlop={8} className="-ml-2 p-2">
            <MaterialIcons name="arrow-back" size={24} color="#e3e2e6" />
          </Pressable>
          <Text className="font-jakarta-semibold text-headline-lg-mobile text-on-surface">
            {isEdit ? 'Редактиране' : 'Ръчно въвеждане'}
          </Text>
          <Pressable onPress={onSave} hitSlop={8} disabled={saving} className="px-2 py-1">
            {saving ? (
              <ActivityIndicator color="#adc7ff" />
            ) : (
              <Text className="font-inter-medium text-label-md text-primary-container">
                {isEdit ? 'ЗАПАЗИ' : 'ГОТОВО'}
              </Text>
            )}
          </Pressable>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled">
          {/* Amount */}
          <View className="mb-16 mt-12 flex-row items-center justify-center px-6">
            <Text className="font-jakarta-semibold text-[64px] text-on-surface opacity-30">€</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="0,00"
              placeholderTextColor="rgba(196,198,208,0.3)"
              keyboardType="decimal-pad"
              autoFocus={!isEdit}
              className="min-w-[120px] text-center font-jakarta-semibold text-[64px] text-on-surface"
            />
          </View>
          {errors.amount ? (
            <Text className="-mt-12 mb-6 text-center font-inter text-body-md text-error">
              {errors.amount}
            </Text>
          ) : null}

          {/* Merchant */}
          <FieldRow label="Търговец">
            <TextInput
              value={merchant}
              onChangeText={setMerchant}
              placeholder="напр. Starbucks"
              placeholderTextColor="rgba(196,198,208,0.3)"
              className="font-inter text-body-lg text-on-surface"
            />
            {errors.merchant ? (
              <Text className="font-inter text-body-md text-error">{errors.merchant}</Text>
            ) : null}
          </FieldRow>

          {/* Category — opens the picker */}
          <FieldRow label="Категория" chevron onPress={() => setPickerOpen(true)}>
            <Text className="font-inter text-body-lg text-on-surface">{categoryLabel}</Text>
          </FieldRow>

          {/* Date — native picker */}
          <DateField value={date} onChange={setDate} />

          {/* Note */}
          <FieldRow label="Бележка">
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Незадължителна бележка"
              placeholderTextColor="rgba(196,198,208,0.3)"
              className="font-inter text-body-lg text-on-surface"
            />
          </FieldRow>
        </ScrollView>
      </SafeAreaView>

      <CategoryPickerModal
        visible={pickerOpen}
        categories={categories}
        selectedId={categoryId}
        onSelect={(cid) => {
          setCategoryId(cid);
          setCategoryTouched(true);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}
```

- [ ] **Step 2: Typecheck + lint + tests**

Run: `npm run typecheck && npm run lint && npm test`
Expected: typecheck 0 errors, lint clean, all suites pass (Day 5 + Task 1's `edit.test.ts`).

- [ ] **Step 3: Commit**

```bash
git add app/manual-entry.tsx
git commit -m "feat(manual-entry): create/edit form with category + date pickers"
```

---

### Task 7: Transaction detail screen + route + row navigation

**Files:**
- Create: `app/transaction/[id].tsx`
- Modify: `app/_layout.tsx` (register the route), `app/(app)/history.tsx` (row `onPress`), `app/(app)/index.tsx` (recent-row `onPress`)

**Interfaces:**
- Consumes: `useTransactionsStore`; `memberName` (Task 1); `deleteTransaction` (Task 2); `refreshTransactions`; `getMembers`/`HouseholdMember` (`@/features/household/api`); `formatCurrency`; `relativeDay`; `MaterialIconName`; `useAuthStore`.
- Produces: the `/transaction/[id]` route. (Receipt thumbnail intentionally omitted — `receipt_id` is always `null` until Day 10; nothing renders when absent, no dead code.)

> No unit test (screen). Gate: `npm run typecheck` + `npm run lint`.

- [ ] **Step 1: Create `app/transaction/[id].tsx`**

```tsx
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackgroundGlow } from '@/components/BackgroundGlow';
import { HairlineDivider } from '@/components/HairlineDivider';
import { useAuthStore } from '@/features/auth/store';
import { getMembers, type HouseholdMember } from '@/features/household/api';
import { deleteTransaction } from '@/features/transactions/api';
import { memberName } from '@/features/transactions/edit';
import { useTransactionsStore } from '@/features/transactions/store';
import { refreshTransactions } from '@/features/transactions/sync';
import type { MaterialIconName } from '@/lib/categories';
import { relativeDay } from '@/lib/dates';
import { formatCurrency } from '@/lib/formatCurrency';

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <View className="flex-row items-center justify-between gap-md px-6 py-4">
        <Text className="font-inter-medium text-label-md uppercase text-on-surface-variant opacity-60">
          {label}
        </Text>
        <Text className="flex-1 text-right font-inter text-body-lg text-on-surface" numberOfLines={1}>
          {value}
        </Text>
      </View>
      <HairlineDivider />
    </View>
  );
}

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tx = useTransactionsStore((s) => s.transactions.find((t) => t.id === id));
  const categories = useTransactionsStore((s) => s.categories);
  const householdId = useAuthStore((s) => s.householdId);
  const [members, setMembers] = useState<HouseholdMember[]>([]);

  useEffect(() => {
    if (householdId) getMembers(householdId).then(setMembers);
  }, [householdId]);

  if (!tx) {
    return (
      <View className="flex-1 bg-background">
        <BackgroundGlow />
        <SafeAreaView className="flex-1 items-center justify-center px-8" edges={['top']}>
          <Text className="text-center font-inter text-body-lg text-on-surface-variant">
            Транзакцията не е намерена.
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="mt-lg rounded-full border border-primary-container px-6 py-2">
            <Text className="font-inter text-label-md text-primary-container">Назад</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  const cat = tx.category_id ? categories.find((c) => c.id === tx.category_id) : undefined;
  const catName = cat?.name ?? 'Other';
  const catIcon = (cat?.icon as MaterialIconName) ?? 'category';
  const catColor = cat?.color ?? '#8e909a';
  const addedBy = memberName(tx.user_id, members);

  const onDelete = () => {
    Alert.alert('Изтриване', 'Сигурни ли сте, че искате да изтриете тази транзакция?', [
      { text: 'Отказ', style: 'cancel' },
      {
        text: 'Изтрий',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTransaction(tx.id);
            if (householdId) await refreshTransactions(householdId);
            router.back();
          } catch {
            Alert.alert('Грешка', 'Неуспешно изтриване. Опитай отново.');
          }
        },
      },
    ]);
  };

  return (
    <View className="flex-1 bg-background">
      <BackgroundGlow />
      <SafeAreaView className="flex-1" edges={['top']}>
        {/* Top app bar */}
        <View className="flex-row items-center justify-between px-6 py-4">
          <Pressable onPress={() => router.back()} hitSlop={8} className="-ml-2 p-2">
            <MaterialIcons name="arrow-back" size={24} color="#e3e2e6" />
          </Pressable>
          <Text className="font-jakarta-semibold text-headline-lg-mobile text-on-surface">
            Транзакция
          </Text>
          <View className="w-8" />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          {/* Hero */}
          <View className="items-center py-xl">
            <Text
              className="font-jakarta-semibold text-on-surface"
              style={{ fontSize: 56, lineHeight: 64 }}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}>
              {formatCurrency(tx.amount_eur)}
            </Text>
            <Text className="mt-sm font-jakarta-semibold text-headline-md text-on-surface">
              {tx.merchant}
            </Text>
            <View className="mt-md flex-row items-center gap-2 rounded-full bg-surface-container px-4 py-2">
              <MaterialIcons name={catIcon} size={18} color={catColor} />
              <Text className="font-inter text-body-md text-on-surface">{catName}</Text>
            </View>
          </View>

          <HairlineDivider />
          <DetailRow label="Дата" value={relativeDay(tx.date)} />
          <DetailRow label="Бележка" value={tx.note?.trim() ? tx.note : '—'} />
          <DetailRow label="Добавено от" value={addedBy} />

          {/* Actions */}
          <View className="mt-xl gap-md px-6">
            <Pressable
              onPress={() => router.navigate(`/manual-entry?id=${tx.id}`)}
              className="items-center rounded-full border border-primary-container py-3 active:bg-primary-container/10">
              <Text className="font-inter text-label-md text-primary-container">Редакция</Text>
            </Pressable>
            <Pressable onPress={onDelete} className="items-center py-3 active:opacity-70">
              <Text className="font-inter text-label-md text-error">Изтрий</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
```

- [ ] **Step 2: Register the route in `app/_layout.tsx`**

In the `<Stack>` block (next to the existing `manual-entry` screen registration), add:

```tsx
        <Stack.Screen name="transaction/[id]" options={{ animation: 'slide_from_right' }} />
```

- [ ] **Step 3: Wire History rows to the detail route**

In `app/(app)/history.tsx`, the rows render as:

```tsx
            {group.items.map((tx, i) => (
              <TransactionRow key={tx.id} tx={tx} showDivider={i < group.items.length - 1} />
            ))}
```

Change to add `onPress`:

```tsx
            {group.items.map((tx, i) => (
              <TransactionRow
                key={tx.id}
                tx={tx}
                onPress={() => router.navigate(`/transaction/${tx.id}`)}
                showDivider={i < group.items.length - 1}
              />
            ))}
```

(`router` is already imported in `history.tsx` from Task 3 Step 2.)

- [ ] **Step 4: Wire Dashboard recent rows to the detail route**

In `app/(app)/index.tsx`, the recent list renders as:

```tsx
        recent.map((tx, i) => (
          <TransactionRow key={tx.id} tx={tx} showDivider={i < recent.length - 1} />
        ))
```

Change to:

```tsx
        recent.map((tx, i) => (
          <TransactionRow
            key={tx.id}
            tx={tx}
            onPress={() => router.navigate(`/transaction/${tx.id}`)}
            showDivider={i < recent.length - 1}
          />
        ))
```

(`router` is already imported in `index.tsx`.)

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add "app/transaction/[id].tsx" "app/_layout.tsx" "app/(app)/history.tsx" "app/(app)/index.tsx"
git commit -m "feat(transactions): read-only detail screen with edit and delete"
```

---

### Task 8: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite**

Run: `npm test`
Expected: all suites pass, including `features/transactions/edit.test.ts` (the new pure helpers) plus all Day-5 suites.

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean, no errors.

- [ ] **Step 3: On-device smoke test (human checkpoint)**

Run `npx expo start` and on a device:
1. Tap a transaction in История → detail opens with amount, merchant, category chip, date, note, and "Добавено от" (your display name).
2. Tap **Редакция** → form prefilled; change the amount, pick a different **Категория** (modal), change the **Дата** (native picker) → **ЗАПАЗИ** → returns; the list + dashboard reflect the change (and the second device via realtime).
3. Open the transaction again → **Изтрий** → confirm → it disappears from История and the dashboard (and the other device).
4. Fresh household (or after deleting all): История, Начало, and Анализи each show their empty state.

- [ ] **Step 4: Update the build plan**

Tick the Day 6 checklist items in `teftera-build-plan.md` (Day 6 block) and note that the category/date pickers deferred from Day 5 landed here. Commit:

```bash
git add teftera-build-plan.md
git commit -m "docs: mark Day 6 complete"
```

---

## Self-Review Notes

- **Spec coverage:** detail screen (T7) · detail fields incl. added-by member + receipt guard (T7) · edit + delete actions (T6 edit, T7 delete) · empty states for history/dashboard/insights (T3) · unit tests for normalization helpers (T1) · category + date pickers, deferred from Day 5 (T4, T5, T6). All spec sections map to tasks.
- **Type consistency:** `ManualEntryFormValues` (T1) consumed in T6; `TransactionPatch` (T2) consumed in T6; `CategoryLite` reused from `groupByDay` by T5/T6; `memberName` signature (T1) matches the `HouseholdMember[]` passed in T7 (`{ userId, displayName, role }` is assignable to `{ userId; displayName }`). `updateTransaction(id, patch)` / `deleteTransaction(id)` names match between T2 and T6/T7.
- **Money/EUR/RLS:** amount stays integer cents through `parseManualEntry`; the `/100` is display-only (mirrors `formatCurrency`); `update`/`delete` rely on the existing transactions RLS; no `$` introduced.
- **YAGNI:** receipt thumbnail is a guard only (no dead UI); Insights keeps its static demo behind the data gate rather than being rewired early.

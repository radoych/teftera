# UX Modals, FAB Actions & Per-User Home Layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the native delete-confirm `Alert` and the deprecated `datetimepicker` with in-app bottom-sheet components, move primary actions to floating action buttons, and let each household member show/hide & reorder their own home-screen sections (persisted per user).

**Architecture:** A shared `BottomSheet` shell backs three sheets (`CategoryPickerModal`, `ConfirmSheet`, `WheelDatePicker`). `FloatingActionBar` gains a bottom placement + destructive/loading variants for non-tab screens. A per-user `user_preferences` table (RLS by `user_id`) drives a Zustand prefs store that the dashboard reads to order/hide its `categories` and `recent` sections; a drag-to-reorder editor in settings writes it back.

**Tech Stack:** Expo + React Native 0.85, TypeScript (strict), NativeWind, Zustand, Supabase (Postgres + RLS), `react-native-gesture-handler` 2.31 + `react-native-reanimated` 4.3 (already installed), Jest.

**Spec:** `docs/superpowers/specs/2026-06-24-ux-modals-and-home-layout-design.md`

## Global Constraints

- TypeScript strict; **no `any`; no plain `.js`**.
- Money is **integer euro-cents**; all display via `formatCurrency`. Currency is **EUR (€)** — never `$`.
- Pill buttons use **`borderRadius: 9999`** in a `style` prop (the Tailwind `full` token is only 12px).
- All user-facing copy is **Bulgarian (bg-BG)**.
- Schema changes are **migration files applied via the Supabase MCP `apply_migration`**; it stamps its own version — **rename the local file to match** the stamped version afterward.
- `user_preferences` is a **documented exception** to the "household_id-pattern RLS" rule: it carries `household_id` but RLS scopes **by `user_id = auth.uid()`** (prefs are per-user).
- Each commit message ends with the footer line: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Gates after every task: `npm run typecheck`, `npm run lint`, `npm test` all green.
- Branch: `feat/ux-modals-and-home-layout`, stacked on `feat/day7-dashboard-real-data`.

---

## File Structure

**New**
- `components/BottomSheet.tsx` — slide-up sheet shell.
- `components/ConfirmSheet.tsx` — confirm dialog (pill buttons).
- `features/transactions/wheelDate.ts` + `.test.ts` — pure wheel/date math.
- `features/transactions/components/WheelDatePicker.tsx` — day/month/year wheels.
- `lib/useKeyboardHeight.ts` — keyboard height hook (for keyboard-aware FAB).
- `features/preferences/types.ts` — pref types.
- `features/preferences/layout.ts` + `.test.ts` — pure layout helpers.
- `features/preferences/api.ts` — get/upsert prefs.
- `features/preferences/store.ts` — Zustand prefs store.
- `features/preferences/sync.ts` — load-on-mount hook.
- `features/preferences/components/SectionLayoutEditor.tsx` — drag-reorder + visibility editor.
- `supabase/migrations/<stamped>_user_preferences.sql` — table + RLS.

**Modified**
- `features/transactions/components/CategoryPickerModal.tsx`, `DateField.tsx`
- `components/FloatingActionBar.tsx`
- `app/manual-entry.tsx`, `app/transaction/[id].tsx`, `app/(app)/index.tsx`, `app/(app)/_layout.tsx`, `app/(app)/profile.tsx`
- `package.json` (remove `@react-native-community/datetimepicker`)

---

## Task 0: Branch

- [ ] **Step 1: Create the branch off Day 7**

```bash
git checkout feat/day7-dashboard-real-data
git checkout -b feat/ux-modals-and-home-layout
```

---

# Phase A — In-App Modals

## Task 1: `BottomSheet` shell + refactor `CategoryPickerModal`

**Files:**
- Create: `components/BottomSheet.tsx`
- Modify: `features/transactions/components/CategoryPickerModal.tsx`

**Interfaces:**
- Produces: `BottomSheet({ visible: boolean, onClose: () => void, children: ReactNode })`.

- [ ] **Step 1: Create `components/BottomSheet.tsx`**

```tsx
import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Slide-up sheet shell: translucent scrim, rounded `surface-container` panel,
 * grabber handle, bottom safe-area. Tap-scrim / Android back close it.
 * The one source of truth for the app's bottom sheets.
 */
export function BottomSheet({ visible, onClose, children }: BottomSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
        <Pressable className="rounded-t-3xl bg-surface-container" onPress={() => {}}>
          <SafeAreaView edges={['bottom']}>
            <View className="items-center py-2">
              <View className="h-1 w-10 rounded-full bg-outline" />
            </View>
            {children}
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
```

- [ ] **Step 2: Refactor `CategoryPickerModal` onto `BottomSheet`**

Replace the file body with (keeps the exact same props + look):

```tsx
import { MaterialIcons } from '@expo/vector-icons';
import { ScrollView, Pressable, Text, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import type { CategoryLite } from '@/features/transactions/groupByDay';
import type { MaterialIconName } from '@/lib/categories';

interface CategoryPickerModalProps {
  visible: boolean;
  categories: CategoryLite[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

/** Bottom-sheet list of the household's categories; controlled select. */
export function CategoryPickerModal({
  visible,
  categories,
  selectedId,
  onSelect,
  onClose,
}: CategoryPickerModalProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
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
    </BottomSheet>
  );
}
```

- [ ] **Step 3: Gates**

Run: `npm run typecheck && npm run lint`
Expected: no errors. (Category picker still opens/selects identically — verify on-device later.)

- [ ] **Step 4: Commit**

```bash
git add components/BottomSheet.tsx features/transactions/components/CategoryPickerModal.tsx
git commit -m "refactor(ui): extract shared BottomSheet; CategoryPicker uses it"
```

---

## Task 2: `wheelDate.ts` pure date math (TDD)

**Files:**
- Create: `features/transactions/wheelDate.ts`
- Test: `features/transactions/wheelDate.test.ts`

**Interfaces:**
- Produces:
  - `daysInMonth(year: number, month: number): number` (month 1-based)
  - `clampDay(year: number, month: number, day: number): number`
  - `partsToISO(year: number, month: number, day: number): string`
  - `isoToParts(iso: string): { year: number; month: number; day: number }`

- [ ] **Step 1: Write the failing test**

Create `features/transactions/wheelDate.test.ts`:

```ts
import { clampDay, daysInMonth, isoToParts, partsToISO } from './wheelDate';

describe('daysInMonth', () => {
  it('knows month lengths including leap February', () => {
    expect(daysInMonth(2026, 1)).toBe(31); // Jan
    expect(daysInMonth(2026, 2)).toBe(28); // Feb non-leap
    expect(daysInMonth(2024, 2)).toBe(29); // Feb leap
    expect(daysInMonth(2026, 4)).toBe(30); // Apr
  });
});

describe('clampDay', () => {
  it('clamps a day into the valid range for the month', () => {
    expect(clampDay(2026, 2, 31)).toBe(28);
    expect(clampDay(2024, 2, 31)).toBe(29);
    expect(clampDay(2026, 1, 15)).toBe(15);
    expect(clampDay(2026, 1, 0)).toBe(1);
  });
});

describe('partsToISO', () => {
  it('zero-pads and clamps the day', () => {
    expect(partsToISO(2026, 6, 4)).toBe('2026-06-04');
    expect(partsToISO(2026, 2, 31)).toBe('2026-02-28');
  });
});

describe('isoToParts', () => {
  it('round-trips with partsToISO', () => {
    expect(isoToParts('2026-06-24')).toEqual({ year: 2026, month: 6, day: 24 });
    const p = isoToParts('2026-02-15');
    expect(partsToISO(p.year, p.month, p.day)).toBe('2026-02-15');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest features/transactions/wheelDate.test.ts`
Expected: FAIL — "Cannot find module './wheelDate'".

- [ ] **Step 3: Write minimal implementation**

Create `features/transactions/wheelDate.ts`:

```ts
// features/transactions/wheelDate.ts — pure date math for the wheel picker.

/** Number of days in a 1-based month of a year. */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Clamp a day to the valid range [1, daysInMonth] for the given year/month. */
export function clampDay(year: number, month: number, day: number): number {
  return Math.min(Math.max(day, 1), daysInMonth(year, month));
}

/** Compose a clamped YYYY-MM-DD from 1-based wheel parts. */
export function partsToISO(year: number, month: number, day: number): string {
  const d = clampDay(year, month, day);
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Decompose an ISO date into 1-based { year, month, day }. */
export function isoToParts(iso: string): { year: number; month: number; day: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { year: y ?? 1970, month: m ?? 1, day: d ?? 1 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest features/transactions/wheelDate.test.ts`
Expected: PASS (all 4 suites).

- [ ] **Step 5: Commit**

```bash
git add features/transactions/wheelDate.ts features/transactions/wheelDate.test.ts
git commit -m "test(date): pure wheel date math (clamp, parts<->iso)"
```

---

## Task 3: `WheelDatePicker` + wire `DateField`, remove `datetimepicker`

**Files:**
- Create: `features/transactions/components/WheelDatePicker.tsx`
- Modify: `features/transactions/components/DateField.tsx`
- Modify: `package.json` (remove `@react-native-community/datetimepicker`)

**Interfaces:**
- Consumes: `BottomSheet`; `daysInMonth`, `clampDay`, `partsToISO`, `isoToParts` from `wheelDate`.
- Produces: `WheelDatePicker({ visible: boolean, value: string /* ISO */, onConfirm: (iso: string) => void, onClose: () => void })`.

- [ ] **Step 1: Create `WheelDatePicker.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { clampDay, daysInMonth, isoToParts, partsToISO } from '@/features/transactions/wheelDate';

const ITEM_HEIGHT = 40;
const VISIBLE = 5; // odd; center row is the selection
const PAD = ((VISIBLE - 1) / 2) * ITEM_HEIGHT;

const MONTHS_BG = [
  'Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни',
  'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември',
];

interface WheelProps {
  items: string[];
  index: number;
  onIndexChange: (i: number) => void;
}

function Wheel({ items, index, onIndexChange }: WheelProps) {
  const ref = useRef<ScrollView>(null);

  // Keep the scroll position in sync when the selected index changes externally
  // (e.g. day re-clamped after a month change).
  useEffect(() => {
    ref.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: false });
  }, [index]);

  return (
    <View style={{ height: ITEM_HEIGHT * VISIBLE }} className="flex-1">
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: PAD }}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
          onIndexChange(Math.min(Math.max(i, 0), items.length - 1));
        }}>
        {items.map((label, i) => (
          <View key={label + i} style={{ height: ITEM_HEIGHT }} className="items-center justify-center">
            <Text
              className={`font-inter text-body-lg ${
                i === index ? 'text-on-surface' : 'text-on-surface-variant opacity-40'
              }`}>
              {label}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

interface WheelDatePickerProps {
  visible: boolean;
  value: string; // ISO YYYY-MM-DD
  onConfirm: (iso: string) => void;
  onClose: () => void;
}

/** Day / month / year scroll-wheels in a bottom sheet. */
export function WheelDatePicker({ visible, value, onConfirm, onClose }: WheelDatePickerProps) {
  const seed = isoToParts(value);
  const [year, setYear] = useState(seed.year);
  const [month, setMonth] = useState(seed.month);
  const [day, setDay] = useState(seed.day);

  // Re-seed each time the sheet opens with a (possibly new) value.
  useEffect(() => {
    if (visible) {
      const p = isoToParts(value);
      setYear(p.year);
      setMonth(p.month);
      setDay(p.day);
    }
  }, [visible, value]);

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: thisYear + 1 - 1970 + 1 }, (_, i) => 1970 + i);
  const monthCount = daysInMonth(year, month);
  const days = Array.from({ length: monthCount }, (_, i) => i + 1);
  const clampedDay = clampDay(year, month, day);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text className="px-6 py-3 font-jakarta-semibold text-headline-md text-on-surface">Дата</Text>
      <View className="flex-row px-6">
        <Wheel
          items={days.map(String)}
          index={clampedDay - 1}
          onIndexChange={(i) => setDay(i + 1)}
        />
        <Wheel items={MONTHS_BG} index={month - 1} onIndexChange={(i) => setMonth(i + 1)} />
        <Wheel
          items={years.map(String)}
          index={years.indexOf(year)}
          onIndexChange={(i) => setYear(years[i]!)}
        />
      </View>
      <View className="px-6 pb-2 pt-4">
        <Pressable
          onPress={() => onConfirm(partsToISO(year, month, day))}
          className="items-center bg-primary-container py-3 active:opacity-80"
          style={{ borderRadius: 9999 }}>
          <Text className="font-inter-semibold text-label-md uppercase" style={{ color: '#112f5e' }}>
            Готово
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}
```

- [ ] **Step 2: Rewrite `DateField.tsx` to use it**

Replace the whole file:

```tsx
import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { HairlineDivider } from '@/components/HairlineDivider';
import { WheelDatePicker } from '@/features/transactions/components/WheelDatePicker';
import { relativeDay } from '@/lib/dates';

interface DateFieldProps {
  value: string; // YYYY-MM-DD
  onChange: (iso: string) => void;
  label?: string;
}

/** A "Дата" row that opens the in-app wheel date picker. */
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

      <WheelDatePicker
        visible={open}
        value={value}
        onConfirm={(iso) => {
          onChange(iso);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}
```

- [ ] **Step 3: Remove the dependency**

Run: `npm uninstall @react-native-community/datetimepicker`
Expected: it disappears from `package.json` dependencies.

- [ ] **Step 4: Gates**

Run: `npm run typecheck && npm run lint && npm test`
Expected: green, and no remaining import of `@react-native-community/datetimepicker` (`grep -r datetimepicker app features` returns nothing).

- [ ] **Step 5: Commit**

```bash
git add features/transactions/components/WheelDatePicker.tsx features/transactions/components/DateField.tsx package.json package-lock.json
git commit -m "feat(date): in-app wheel date picker; drop native datetimepicker"
```

> On-device tuning note: if a wheel's resting position is off by one row, adjust `PAD`/`ITEM_HEIGHT` alignment — the selection index math is unit-tested but the visual centering is device-verified.

---

## Task 4: `ConfirmSheet` + wire detail-screen delete

**Files:**
- Create: `components/ConfirmSheet.tsx`
- Modify: `app/transaction/[id].tsx`

**Interfaces:**
- Consumes: `BottomSheet`.
- Produces: `ConfirmSheet({ visible, title, message?, confirmLabel, cancelLabel?, destructive?, onConfirm, onCancel })`.

- [ ] **Step 1: Create `components/ConfirmSheet.tsx`**

```tsx
import { Pressable, Text, View } from 'react-native';
import { BottomSheet } from './BottomSheet';

interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirm dialog as a bottom sheet with pill buttons. */
export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Отказ',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onCancel}>
      <View className="gap-md px-6 pb-4 pt-2">
        <Text className="font-jakarta-semibold text-headline-md text-on-surface">{title}</Text>
        {message ? (
          <Text className="font-inter text-body-md text-on-surface-variant">{message}</Text>
        ) : null}
        <Pressable
          onPress={onConfirm}
          className={`items-center py-3 active:opacity-80 ${
            destructive ? 'bg-error-container' : 'bg-primary-container'
          }`}
          style={{ borderRadius: 9999 }}>
          <Text
            className="font-inter-semibold text-label-md uppercase"
            style={{ color: destructive ? '#ffb4ab' : '#112f5e' }}>
            {confirmLabel}
          </Text>
        </Pressable>
        <Pressable
          onPress={onCancel}
          className="items-center border border-white/10 py-3 active:bg-white/5"
          style={{ borderRadius: 9999 }}>
          <Text className="font-inter-semibold text-label-md uppercase text-on-surface">
            {cancelLabel}
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}
```

- [ ] **Step 2: Wire it into the detail screen's delete**

In `app/transaction/[id].tsx`: add `ConfirmSheet` import, a `confirmOpen` + `deleteError` state, change `onDelete` to open the sheet, and render the sheet. Replace the existing `onDelete` (the `Alert.alert` version) with:

```tsx
import { ConfirmSheet } from '@/components/ConfirmSheet';
// ...
const [confirmOpen, setConfirmOpen] = useState(false);
const [deleteError, setDeleteError] = useState(false);

const onConfirmDelete = async () => {
  try {
    await deleteTransaction(tx.id);
    if (householdId) await refreshTransactions(householdId);
    setConfirmOpen(false);
    router.back();
  } catch {
    setConfirmOpen(false);
    setDeleteError(true);
  }
};
```

Change the existing Изтрий `Pressable` `onPress` from `onDelete` to `() => setConfirmOpen(true)`. Keep `Alert` removed from imports if now unused. Before the closing `</View>` of the screen, render:

```tsx
<ConfirmSheet
  visible={confirmOpen}
  title="Изтриване"
  message="Сигурни ли сте, че искате да изтриете тази транзакция?"
  confirmLabel="Изтрий"
  destructive
  onConfirm={onConfirmDelete}
  onCancel={() => setConfirmOpen(false)}
/>
<ConfirmSheet
  visible={deleteError}
  title="Грешка"
  message="Неуспешно изтриване. Опитай отново."
  confirmLabel="Добре"
  onConfirm={() => setDeleteError(false)}
  onCancel={() => setDeleteError(false)}
/>
```

(The Изтрий/Редакция buttons themselves are relocated to FABs in Task 7; this task only swaps the confirm mechanism.)

- [ ] **Step 3: Gates**

Run: `npm run typecheck && npm run lint`
Expected: green; `Alert` no longer imported if unused (lint will flag an unused import — remove it).

- [ ] **Step 4: Commit**

```bash
git add components/ConfirmSheet.tsx "app/transaction/[id].tsx"
git commit -m "feat(ui): in-app ConfirmSheet replaces native delete Alert"
```

---

# Phase B — FAB Actions & Последни→3

## Task 5: `FloatingActionBar` — placement, destructive, loading/disabled + keyboard lift

**Files:**
- Create: `lib/useKeyboardHeight.ts`
- Modify: `components/FloatingActionBar.tsx`

**Interfaces:**
- Produces:
  - `useKeyboardHeight(): number` (0 when hidden)
  - `FloatingAction` gains `variant?: 'filled' | 'ghost' | 'destructive'`, `loading?: boolean`, `disabled?: boolean`.
  - `FloatingActionBar({ actions, placement?: 'aboveTabBar' | 'bottom', liftWithKeyboard?: boolean })`.

- [ ] **Step 1: Create `lib/useKeyboardHeight.ts`**

```ts
import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/** Current on-screen keyboard height (0 when hidden). */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvt, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
```

- [ ] **Step 2: Rewrite `components/FloatingActionBar.tsx`**

```tsx
import { MaterialIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardHeight } from '@/lib/useKeyboardHeight';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

export interface FloatingAction {
  label: string;
  icon: IconName;
  onPress?: () => void;
  /** 'filled' = primary accent, 'ghost' = outlined (default), 'destructive' = error. */
  variant?: 'filled' | 'ghost' | 'destructive';
  loading?: boolean;
  disabled?: boolean;
}

const VARIANTS = {
  filled: { container: 'bg-primary-container', content: '#112f5e' },
  ghost: { container: 'border border-white/10 bg-surface-container-high', content: '#e3e2e6' },
  destructive: { container: 'bg-error-container', content: '#ffb4ab' },
} as const;

interface FloatingActionBarProps {
  actions: FloatingAction[];
  /** 'aboveTabBar' floats above the nav pill (default); 'bottom' pins near the safe-area bottom. */
  placement?: 'aboveTabBar' | 'bottom';
  /** When true (use with 'bottom'), the bar rises above the keyboard. */
  liftWithKeyboard?: boolean;
}

/**
 * A row of pill actions. 'aboveTabBar' keeps the centered cluster above the nav
 * pill; 'bottom' lays actions out full-width (space-between) near the bottom of
 * a non-tab screen, optionally lifting above the keyboard.
 */
export function FloatingActionBar({
  actions,
  placement = 'aboveTabBar',
  liftWithKeyboard = false,
}: FloatingActionBarProps) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();

  const bottom =
    placement === 'aboveTabBar'
      ? insets.bottom + 88
      : (liftWithKeyboard && keyboard > 0 ? keyboard : insets.bottom) + 16;

  const single = actions.length === 1;

  const buttons = actions.map((action) => {
    const v = VARIANTS[action.variant ?? 'ghost'];
    const inactive = action.disabled || action.loading;
    return (
      <Pressable
        key={action.label}
        onPress={inactive ? undefined : action.onPress}
        disabled={inactive}
        accessibilityRole="button"
        className={`h-12 flex-row items-center justify-center gap-2 rounded-full px-6 active:opacity-80 ${
          v.container
        } ${placement === 'bottom' && !single ? 'flex-1' : ''} ${inactive ? 'opacity-60' : ''}`}>
        {action.loading ? (
          <ActivityIndicator color={v.content} />
        ) : (
          <>
            <MaterialIcons name={action.icon} size={18} color={v.content} />
            <Text
              style={{ color: v.content }}
              className="font-inter-semibold text-label-md uppercase">
              {action.label}
            </Text>
          </>
        )}
      </Pressable>
    );
  });

  if (placement === 'bottom') {
    return (
      <View
        style={{ position: 'absolute', left: 0, right: 0, bottom, pointerEvents: 'box-none' }}
        className="px-md">
        <View className={`flex-row gap-md ${single ? 'justify-center' : 'justify-between'}`}>
          {buttons}
        </View>
      </View>
    );
  }

  return (
    <View
      style={{ position: 'absolute', left: 0, right: 0, bottom, pointerEvents: 'box-none' }}
      className="items-center px-md">
      <View style={{ transform: [{ scale: 1.1 }] }} className="flex-row justify-center gap-md">
        {buttons}
      </View>
    </View>
  );
}
```

> Note: existing callers (dashboard, history) pass only `actions` → default `placement='aboveTabBar'` preserves current behavior. The pill height moved 40→48 (`h-12`) for the bottom action targets; `aboveTabBar` callers are unaffected visually beyond a slightly taller pill — acceptable, verify on-device.

- [ ] **Step 3: Gates**

Run: `npm run typecheck && npm run lint`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add lib/useKeyboardHeight.ts components/FloatingActionBar.tsx
git commit -m "feat(ui): FloatingActionBar bottom placement + destructive/loading"
```

---

## Task 6: Manual-entry Готово → bottom FAB (keyboard-aware)

**Files:**
- Modify: `app/manual-entry.tsx`

**Interfaces:**
- Consumes: `FloatingActionBar` (`placement='bottom'`, `liftWithKeyboard`).

- [ ] **Step 1: Remove the top-right action, add the bottom FAB**

In `app/manual-entry.tsx`:
1. Add import: `import { FloatingActionBar } from '@/components/FloatingActionBar';`
2. In the top app bar, replace the right-hand save `Pressable` (the one rendering `ActivityIndicator` / `ГОТОВО`/`ЗАПАЗИ`) with a spacer to keep the title centered:

```tsx
<View className="w-8" />
```

3. Add bottom padding so fields clear the FAB — change the `ScrollView` to:

```tsx
<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 96 }}>
```

4. Immediately before the `<CategoryPickerModal ... />` near the end, add the FAB:

```tsx
<FloatingActionBar
  placement="bottom"
  liftWithKeyboard
  actions={[
    {
      label: isEdit ? 'Запази' : 'Готово',
      icon: 'check',
      variant: 'filled',
      loading: saving,
      onPress: onSave,
    },
  ]}
/>
```

5. Remove the now-unused `ActivityIndicator` import if nothing else uses it (lint will flag it).

- [ ] **Step 2: Gates**

Run: `npm run typecheck && npm run lint`
Expected: green (no unused imports).

- [ ] **Step 3: Commit**

```bash
git add app/manual-entry.tsx
git commit -m "feat(entry): Готово as keyboard-aware bottom FAB"
```

---

## Task 7: Detail screen Изтрий/Редакция → bottom FABs

**Files:**
- Modify: `app/transaction/[id].tsx`

**Interfaces:**
- Consumes: `FloatingActionBar` (`placement='bottom'`, two actions: destructive + filled).

- [ ] **Step 1: Replace the inline action block with FABs**

In `app/transaction/[id].tsx`:
1. Add import: `import { FloatingActionBar } from '@/components/FloatingActionBar';`
2. Delete the in-`ScrollView` actions `View` (the block containing the Редакция and Изтрий `Pressable`s).
3. Add bottom padding to the `ScrollView`: `contentContainerStyle={{ paddingBottom: 96 }}`.
4. After the `</SafeAreaView>` content but inside the root `View` (sibling to `SafeAreaView`, before the `ConfirmSheet`s), add:

```tsx
<FloatingActionBar
  placement="bottom"
  actions={[
    {
      label: 'Изтрий',
      icon: 'delete-outline',
      variant: 'destructive',
      onPress: () => setConfirmOpen(true),
    },
    {
      label: 'Редакция',
      icon: 'edit',
      variant: 'filled',
      onPress: () => router.navigate(`/manual-entry?id=${tx.id}`),
    },
  ]}
/>
```

(Изтрий first → renders left; Редакция → right, per the design.)

- [ ] **Step 2: Gates**

Run: `npm run typecheck && npm run lint`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add "app/transaction/[id].tsx"
git commit -m "feat(detail): Изтрий/Редакция as bottom FABs"
```

---

## Task 8: Последни → 3 on the dashboard

**Files:**
- Modify: `app/(app)/index.tsx`

- [ ] **Step 1: Limit recent to 3**

In `app/(app)/index.tsx`, in the `recent` memo, change `filtered.slice(0, 5)` to `filtered.slice(0, 3)`.

- [ ] **Step 2: Gates**

Run: `npm run typecheck && npm run lint && npm test`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/index.tsx"
git commit -m "feat(dashboard): limit Последни to 3"
```

---

# Phase C — Per-User Home Layout

## Task 9: `user_preferences` migration

**Files:**
- Create: `supabase/migrations/<stamped>_user_preferences.sql`

- [ ] **Step 1: Write the migration SQL locally**

Create `supabase/migrations/0008_user_preferences.sql` (the leading number is a placeholder; the MCP will stamp the real version):

```sql
create table public.user_preferences (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  settings     jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

create policy user_preferences_rw on public.user_preferences
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

- [ ] **Step 2: Apply via Supabase MCP**

Use the Supabase MCP `apply_migration` with name `user_preferences` and the SQL above.
Then **rename** the local file to the version the MCP stamped (check `list_migrations`), e.g. `supabase/migrations/<stamped>_user_preferences.sql`.

- [ ] **Step 3: Verify**

- Run Supabase MCP `list_tables` → `user_preferences` exists with the four columns + RLS enabled.
- Run Supabase MCP `get_advisors` (security) → no new critical findings beyond the documented per-user RLS (the `user_id = auth.uid()` policy is intended; see [[schema-hardening-decisions]]).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations
git commit -m "feat(db): user_preferences table with per-user RLS"
```

---

## Task 10: Preferences types + API

**Files:**
- Create: `features/preferences/types.ts`
- Create: `features/preferences/api.ts`

**Interfaces:**
- Produces:
  - `type DashboardSectionKey = 'categories' | 'recent'`
  - `interface DashboardSection { key: DashboardSectionKey; visible: boolean }`
  - `interface UserPreferences { version: 1; dashboardSections: DashboardSection[] }`
  - `getMyPreferences(userId: string): Promise<UserPreferences | null>`
  - `upsertMyPreferences(input: { userId: string; householdId: string; settings: UserPreferences }): Promise<void>`

- [ ] **Step 1: Create `features/preferences/types.ts`**

```ts
export type DashboardSectionKey = 'categories' | 'recent';

export interface DashboardSection {
  key: DashboardSectionKey;
  visible: boolean;
}

export interface UserPreferences {
  version: 1;
  dashboardSections: DashboardSection[];
}
```

- [ ] **Step 2: Create `features/preferences/api.ts`**

```ts
// features/preferences/api.ts — the ONLY module that reads/writes user_preferences.
import { supabase } from '@/services/supabase';
import type { UserPreferences } from './types';

/** The signed-in user's preferences row, or null when none exists yet. */
export async function getMyPreferences(userId: string): Promise<UserPreferences | null> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('settings')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.settings as UserPreferences | undefined) ?? null;
}

/** Upsert the signed-in user's preferences. RLS scopes by user_id. */
export async function upsertMyPreferences(input: {
  userId: string;
  householdId: string;
  settings: UserPreferences;
}): Promise<void> {
  const { error } = await supabase.from('user_preferences').upsert({
    user_id: input.userId,
    household_id: input.householdId,
    settings: input.settings,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
```

- [ ] **Step 3: Gates**

Run: `npm run typecheck && npm run lint`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add features/preferences/types.ts features/preferences/api.ts
git commit -m "feat(prefs): user_preferences types + api"
```

---

## Task 11: Pure layout helpers (TDD)

**Files:**
- Create: `features/preferences/layout.ts`
- Test: `features/preferences/layout.test.ts`

**Interfaces:**
- Consumes: `DashboardSection`, `DashboardSectionKey` from `./types`.
- Produces:
  - `DEFAULT_DASHBOARD_SECTIONS: DashboardSection[]`
  - `resolveDashboardSections(stored?: DashboardSection[] | null): DashboardSection[]`
  - `moveItem<T>(arr: T[], from: number, to: number): T[]`
  - `setSectionVisible(sections: DashboardSection[], key: DashboardSectionKey, visible: boolean): DashboardSection[]`

- [ ] **Step 1: Write the failing test**

Create `features/preferences/layout.test.ts`:

```ts
import {
  DEFAULT_DASHBOARD_SECTIONS,
  moveItem,
  resolveDashboardSections,
  setSectionVisible,
} from './layout';

describe('resolveDashboardSections', () => {
  it('returns defaults for empty/nullish input', () => {
    expect(resolveDashboardSections(null)).toEqual(DEFAULT_DASHBOARD_SECTIONS);
    expect(resolveDashboardSections([])).toEqual(DEFAULT_DASHBOARD_SECTIONS);
  });

  it('preserves stored order and visibility', () => {
    const stored = [
      { key: 'recent' as const, visible: false },
      { key: 'categories' as const, visible: true },
    ];
    expect(resolveDashboardSections(stored)).toEqual(stored);
  });

  it('appends known sections missing from storage (visible)', () => {
    const stored = [{ key: 'recent' as const, visible: true }];
    expect(resolveDashboardSections(stored)).toEqual([
      { key: 'recent', visible: true },
      { key: 'categories', visible: true },
    ]);
  });

  it('drops unknown keys', () => {
    const stored = [
      { key: 'budgets' as unknown as 'recent', visible: true },
      { key: 'recent' as const, visible: true },
      { key: 'categories' as const, visible: true },
    ];
    expect(resolveDashboardSections(stored)).toEqual([
      { key: 'recent', visible: true },
      { key: 'categories', visible: true },
    ]);
  });
});

describe('moveItem', () => {
  it('moves an item to a new index', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('is a no-op (copy) for same/out-of-range indices', () => {
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });
});

describe('setSectionVisible', () => {
  it('toggles one section immutably', () => {
    const sections = [
      { key: 'categories' as const, visible: true },
      { key: 'recent' as const, visible: true },
    ];
    const next = setSectionVisible(sections, 'categories', false);
    expect(next).toEqual([
      { key: 'categories', visible: false },
      { key: 'recent', visible: true },
    ]);
    expect(sections[0]!.visible).toBe(true); // original untouched
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest features/preferences/layout.test.ts`
Expected: FAIL — "Cannot find module './layout'".

- [ ] **Step 3: Write minimal implementation**

Create `features/preferences/layout.ts`:

```ts
import type { DashboardSection, DashboardSectionKey } from './types';

export const DEFAULT_DASHBOARD_SECTIONS: DashboardSection[] = [
  { key: 'categories', visible: true },
  { key: 'recent', visible: true },
];

const KNOWN_KEYS: DashboardSectionKey[] = ['categories', 'recent'];

/**
 * Normalize stored sections: keep stored order, append any known section that is
 * missing (visible), and drop unknown keys. Forward/backward-safe so adding a
 * new section key later just appends it for existing users.
 */
export function resolveDashboardSections(
  stored?: DashboardSection[] | null,
): DashboardSection[] {
  if (!stored || stored.length === 0) {
    return DEFAULT_DASHBOARD_SECTIONS.map((s) => ({ ...s }));
  }
  const seen = new Set<DashboardSectionKey>();
  const result: DashboardSection[] = [];
  for (const s of stored) {
    if (KNOWN_KEYS.includes(s.key) && !seen.has(s.key)) {
      result.push({ key: s.key, visible: s.visible !== false });
      seen.add(s.key);
    }
  }
  for (const key of KNOWN_KEYS) {
    if (!seen.has(key)) result.push({ key, visible: true });
  }
  return result;
}

/** Immutably move an array item from one index to another. */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) {
    return arr.slice();
  }
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item as T);
  return copy;
}

/** Toggle one section's visibility by key (immutable). */
export function setSectionVisible(
  sections: DashboardSection[],
  key: DashboardSectionKey,
  visible: boolean,
): DashboardSection[] {
  return sections.map((s) => (s.key === key ? { ...s, visible } : s));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest features/preferences/layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/preferences/layout.ts features/preferences/layout.test.ts
git commit -m "test(prefs): layout resolve/move/visibility helpers"
```

---

## Task 12: Preferences store + load-on-mount sync

**Files:**
- Create: `features/preferences/store.ts`
- Create: `features/preferences/sync.ts`
- Modify: `app/(app)/_layout.tsx`

**Interfaces:**
- Consumes: `getMyPreferences`; `resolveDashboardSections`, `DEFAULT_DASHBOARD_SECTIONS`; `useAuthStore`.
- Produces:
  - `usePreferencesStore` with `{ preferences: UserPreferences; loaded: boolean; setPreferences(p); reset() }`
  - `usePreferencesSync(): void`

- [ ] **Step 1: Create `features/preferences/store.ts`**

```ts
import { create } from 'zustand';
import { DEFAULT_DASHBOARD_SECTIONS } from './layout';
import type { UserPreferences } from './types';

const DEFAULT_PREFERENCES: UserPreferences = {
  version: 1,
  dashboardSections: DEFAULT_DASHBOARD_SECTIONS.map((s) => ({ ...s })),
};

interface PreferencesState {
  preferences: UserPreferences;
  loaded: boolean;
  setPreferences: (preferences: UserPreferences) => void;
  reset: () => void;
}

export const usePreferencesStore = create<PreferencesState>((set) => ({
  preferences: DEFAULT_PREFERENCES,
  loaded: false,
  setPreferences: (preferences) => set({ preferences, loaded: true }),
  reset: () => set({ preferences: DEFAULT_PREFERENCES, loaded: false }),
}));
```

- [ ] **Step 2: Create `features/preferences/sync.ts`**

```ts
// features/preferences/sync.ts — load the user's preferences once on app mount.
import { useEffect } from 'react';
import { useAuthStore } from '@/features/auth/store';
import { getMyPreferences } from './api';
import { resolveDashboardSections } from './layout';
import { usePreferencesStore } from './store';

/** Fetch the signed-in user's preferences into the store. Call once in (app) layout. */
export function usePreferencesSync(): void {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);

  useEffect(() => {
    if (!userId) {
      usePreferencesStore.getState().reset();
      return;
    }
    let active = true;
    (async () => {
      try {
        const stored = await getMyPreferences(userId);
        if (!active) return;
        usePreferencesStore.getState().setPreferences({
          version: 1,
          dashboardSections: resolveDashboardSections(stored?.dashboardSections),
        });
      } catch (err) {
        if (__DEV__) console.warn('[preferences] load failed', err);
        if (active) {
          usePreferencesStore.getState().setPreferences({
            version: 1,
            dashboardSections: resolveDashboardSections(null),
          });
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [userId]);
}
```

- [ ] **Step 3: Mount the hook in `app/(app)/_layout.tsx`**

Add `import { usePreferencesSync } from '@/features/preferences/sync';` and call `usePreferencesSync();` in the layout component body, right next to the existing `useTransactionsSync();` call.

- [ ] **Step 4: Gates**

Run: `npm run typecheck && npm run lint && npm test`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add features/preferences/store.ts features/preferences/sync.ts "app/(app)/_layout.tsx"
git commit -m "feat(prefs): preferences store + load-on-mount sync"
```

---

## Task 13: Dashboard renders sections by preference

**Files:**
- Modify: `app/(app)/index.tsx`

**Interfaces:**
- Consumes: `usePreferencesStore`.

- [ ] **Step 1: Extract the two configurable sections and render them in order**

In `app/(app)/index.tsx`:
1. Add imports:

```tsx
import { usePreferencesStore } from '@/features/preferences/store';
```

2. Read the sections (after the other store reads):

```tsx
const dashboardSections = usePreferencesStore((s) => s.preferences.dashboardSections);
```

3. Define the two section renderers as locals inside the component (using the existing `categoryRows`, `recent`, etc.). Replace the current inline **"Spending by category"** block and **"Recent entries"** block with `const`s:

```tsx
const categoriesSection =
  loaded && categoryRows.length > 0 ? (
    <View className="mb-xl">
      <SectionLabel className="mb-md">По категория</SectionLabel>
      {categoryRows.map((row) => (
        <View key={row.id} className="py-sm">
          <View className="mb-2 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <MaterialIcons name={row.icon} size={16} color={row.color} />
              <Text className="font-inter text-body-md text-on-surface">{row.name}</Text>
            </View>
            <Text className="font-inter-semibold text-body-md text-on-surface">
              {formatCurrency(row.totalCents)}
            </Text>
          </View>
          <View className="h-1.5 overflow-hidden bg-surface-container" style={{ borderRadius: 9999 }}>
            <View
              className="h-full"
              style={{
                width: `${Math.max(row.fraction * 100, 2)}%`,
                backgroundColor: row.color,
                borderRadius: 9999,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  ) : null;

const recentSection = (
  <View>
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
      <EmptyState icon="receipt-long" title="Все още няма транзакции" />
    ) : (
      recent.map((tx, i) => (
        <TransactionRow
          key={tx.id}
          tx={tx}
          onPress={() => router.navigate(`/transaction/${tx.id}`)}
          showDivider={i < recent.length - 1}
        />
      ))
    )}
  </View>
);

const sectionContent: Record<'categories' | 'recent', React.ReactNode> = {
  categories: categoriesSection,
  recent: recentSection,
};
```

4. Where those two blocks used to render (after the scope toggle `View`), render them by preference order:

```tsx
{dashboardSections
  .filter((s) => s.visible)
  .map((s) => (
    <View key={s.key}>{sectionContent[s.key]}</View>
  ))}
```

- [ ] **Step 2: Gates**

Run: `npm run typecheck && npm run lint && npm test`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/index.tsx"
git commit -m "feat(dashboard): render home sections by user preference"
```

---

## Task 14: `SectionLayoutEditor` (drag + visibility) in settings

**Files:**
- Create: `features/preferences/components/SectionLayoutEditor.tsx`
- Modify: `app/(app)/profile.tsx`

**Interfaces:**
- Consumes: `usePreferencesStore`, `useAuthStore`, `upsertMyPreferences`, `moveItem`, `setSectionVisible`, `SegmentedToggle`.

- [ ] **Step 1: Create `features/preferences/components/SectionLayoutEditor.tsx`**

```tsx
import { MaterialIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { SegmentedToggle } from '@/components/SegmentedToggle';
import { moveItem, setSectionVisible } from '@/features/preferences/layout';
import type { DashboardSection, DashboardSectionKey } from '@/features/preferences/types';

const ROW_HEIGHT = 56;

const LABELS: Record<DashboardSectionKey, string> = {
  categories: 'По категория',
  recent: 'Последни',
};

interface RowProps {
  section: DashboardSection;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onVisible: (key: DashboardSectionKey, visible: boolean) => void;
}

function DraggableRow({ section, index, count, onMove, onVisible }: RowProps) {
  const translateY = useSharedValue(0);
  const zIndex = useSharedValue(0);

  const pan = Gesture.Pan()
    .activateAfterLongPress(150)
    .onStart(() => {
      zIndex.value = 1;
    })
    .onUpdate((e) => {
      translateY.value = e.translationY;
    })
    .onEnd(() => {
      const delta = Math.round(translateY.value / ROW_HEIGHT);
      const target = Math.min(Math.max(index + delta, 0), count - 1);
      translateY.value = 0;
      zIndex.value = 0;
      if (target !== index) runOnJS(onMove)(index, target);
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    zIndex: zIndex.value,
  }));

  return (
    <Animated.View style={style}>
      <View style={{ height: ROW_HEIGHT }} className="flex-row items-center justify-between gap-md">
        <View className="flex-1 flex-row items-center gap-3">
          <GestureDetector gesture={pan}>
            <View hitSlop={8} className="py-2 pr-1">
              <MaterialIcons name="drag-handle" size={22} color="#8e909a" />
            </View>
          </GestureDetector>
          <Text className="font-inter text-body-lg text-on-surface">{LABELS[section.key]}</Text>
        </View>
        <SegmentedToggle<'on' | 'off'>
          value={section.visible ? 'on' : 'off'}
          onChange={(v) => onVisible(section.key, v === 'on')}
          options={[
            { value: 'on', label: 'Вкл' },
            { value: 'off', label: 'Изкл' },
          ]}
        />
      </View>
    </Animated.View>
  );
}

interface SectionLayoutEditorProps {
  sections: DashboardSection[];
  onChange: (next: DashboardSection[]) => void;
}

/** Drag-to-reorder + show/hide editor for the home sections. */
export function SectionLayoutEditor({ sections, onChange }: SectionLayoutEditorProps) {
  return (
    <View>
      {sections.map((section, index) => (
        <DraggableRow
          key={section.key}
          section={section}
          index={index}
          count={sections.length}
          onMove={(from, to) => onChange(moveItem(sections, from, to))}
          onVisible={(key, visible) => onChange(setSectionVisible(sections, key, visible))}
        />
      ))}
    </View>
  );
}
```

- [ ] **Step 2: Embed it in `profile.tsx` with persistence**

In `app/(app)/profile.tsx`:
1. Add imports:

```tsx
import { SectionLayoutEditor } from '@/features/preferences/components/SectionLayoutEditor';
import { usePreferencesStore } from '@/features/preferences/store';
import { upsertMyPreferences } from '@/features/preferences/api';
import type { UserPreferences } from '@/features/preferences/types';
```

2. Read prefs + ids in the component body:

```tsx
const preferences = usePreferencesStore((s) => s.preferences);
const setPreferences = usePreferencesStore((s) => s.setPreferences);
```

(`session` and `householdId` are already read in this screen.)

3. Add the persist handler:

```tsx
const onLayoutChange = async (next: UserPreferences['dashboardSections']) => {
  const prev = preferences;
  const updated: UserPreferences = { version: 1, dashboardSections: next };
  setPreferences(updated); // optimistic
  const userId = session?.user.id;
  if (!userId || !householdId) return;
  try {
    await upsertMyPreferences({ userId, householdId, settings: updated });
  } catch {
    setPreferences(prev); // revert on failure
  }
};
```

4. Add a new "Начало" section to the JSX (e.g. directly above the "Предпочитания" block):

```tsx
<View className="mt-lg">
  <SectionLabel className="mb-md">Начало</SectionLabel>
  <SectionLayoutEditor
    sections={preferences.dashboardSections}
    onChange={onLayoutChange}
  />
</View>
```

- [ ] **Step 3: Confirm gesture-handler root (already present)**

`app/_layout.tsx` already wraps the tree in `GestureHandlerRootView` (lines ~51–72), so `GestureDetector` will receive touches — no change needed. Just confirm it still wraps the root before relying on the drag gesture. (Do **not** add a second `GestureHandlerRootView`.)

- [ ] **Step 4: Gates**

Run: `npm run typecheck && npm run lint && npm test`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add features/preferences/components/SectionLayoutEditor.tsx "app/(app)/profile.tsx" "app/_layout.tsx"
git commit -m "feat(prefs): home-layout editor (drag + show/hide) in settings"
```

> On-device note: drag-reorder rides on reanimated 4 / RN 0.85. If the drag gesture misbehaves (no pickup, jumpy index), the agreed fallback is up/down arrow buttons instead of `Gesture.Pan` — swap `DraggableRow`'s drag handle for two arrow `Pressable`s calling `onMove(index, index-1)` / `onMove(index, index+1)`. Confirm with the human before spending long on gesture tuning.

---

## Final verification (human, on-device)

1. **Delete confirm:** Detail → Изтрий → in-app sheet with pill buttons → deletes on both devices.
2. **Date picker:** Manual entry → Дата → wheels; pick 31 Jan then switch to Feb → day clamps to 28/29.
3. **FABs:** Manual-entry Готово is a bottom FAB, visible above the keyboard; detail shows Изтрий (left, red) + Редакция (right).
4. **Последни:** dashboard shows at most 3.
5. **Layout prefs:** Settings → Начало → hide По категория, drag Последни above it → home reflects it; the other member's home is unaffected; relaunch keeps the layout.
6. **Gates:** `npm run typecheck`, `npm run lint`, `npm test` all green.

---

## Self-review notes

- **Spec coverage:** BottomSheet/ConfirmSheet (T1,T4) · wheel picker + dep removal (T2,T3) · FAB placement/destructive/loading + keyboard (T5) · manual-entry & detail FABs (T6,T7) · Последни→3 (T8) · migration (T9) · prefs types/api/store/sync/layout (T10–12) · dashboard consumption (T13) · drag editor in settings (T14). All spec sections mapped.
- **Type consistency:** `DashboardSection`/`DashboardSectionKey`/`UserPreferences` identical across types/api/store/sync/layout/components; `resolveDashboardSections`, `moveItem`, `setSectionVisible`, `getMyPreferences`, `upsertMyPreferences`, `usePreferencesSync` names consistent between producer and consumer tasks.
- **Placeholders:** the only `<stamped>` placeholder is the MCP-stamped migration filename, resolved in T9 Step 2.

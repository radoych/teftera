# UX Polish — In-App Modals, FAB Actions & Per-User Home Layout (Design)

**Date:** 2026-06-24
**Branch:** `feat/ux-modals-and-home-layout` (stacked on Day 7 / `feat/day7-dashboard-real-data`; rebase or merge onto `main` after Day 7 lands)
**Builds on:** Day 6 detail/edit + pickers, Day 7 dashboard (`app/(app)/index.tsx`, `components/SegmentedToggle.tsx`, `features/transactions/*`).

## Goal

Replace the two remaining native/library modals (the `Alert.alert` delete confirm and the `@react-native-community/datetimepicker`) with in-app components that match the app's bottom-sheet design language; relocate primary actions to floating action buttons; and let each household member customize their own Начало (home) screen — show/hide and reorder the **По категория** and **Последни** sections — persisted per user.

## Scope decisions (locked during brainstorming)

1. **Date picker:** custom **scrolling-wheel** picker (day / month bg-BG / year) inside a bottom sheet. The `@react-native-community/datetimepicker` dependency is **removed** — eliminating its `onChange` deprecation warning.
2. **Confirm dialog:** custom **bottom sheet** (matches `CategoryPickerModal`) with **pill** buttons (`borderRadius: 9999`) — destructive confirm in `error` styling, cancel as a ghost pill.
3. **Shared sheet shell:** extract a reusable `BottomSheet` from the existing `CategoryPickerModal`; `CategoryPickerModal`, `ConfirmSheet`, and `WheelDatePicker` all build on it.
4. **FAB relocations:** `FloatingActionBar` gains a `placement` (`aboveTabBar` default | `bottom`), a `destructive` variant, and per-action `loading`/`disabled`. Manual-entry Готово/Запази becomes a single bottom FAB (keyboard-aware); detail Изтрий (destructive, left) + Редакция (filled, right) become bottom FABs.
5. **Последни → 3** on the dashboard (Виж всички covers the rest).
6. **Per-user layout prefs:** new `user_preferences` table (`user_id` PK = `auth.uid()`, `household_id` carried for rule-compliance, `settings jsonb`). RLS scopes **by `user_id`** — a documented, intentional exception to the household_id-pattern rule because preferences are inherently per-user.
7. **Reorder UX:** drag-to-reorder built on the already-installed `react-native-gesture-handler` + `react-native-reanimated` (**no new dependency**); visibility is a 2-segment **Вкл/Изкл** pill reusing `SegmentedToggle`.
8. **No realtime for prefs:** save writes DB + updates the local store immediately; a second device picks up changes on next launch (YAGNI).

## Out of scope (deferred)

- Reordering/hiding the dashboard **hero** (always top) or any section beyond `categories` / `recent`.
- Reordering/hiding sections on History or Insights.
- Theme/color/font preferences (only home-section layout this slice).
- Cross-device live sync of preferences (re-launch refresh is sufficient).

---

## Architecture & file plan

### New files
| File | Responsibility |
|---|---|
| `components/BottomSheet.tsx` | Reusable slide-up sheet shell (overlay, grabber, `surface-container`, bottom safe-area). |
| `components/ConfirmSheet.tsx` | Confirm dialog on `BottomSheet`; pill confirm/cancel, optional destructive. |
| `features/transactions/components/WheelDatePicker.tsx` | Day/month/year snap-scroll wheels in a `BottomSheet`. |
| `features/transactions/wheelDate.ts` | Pure date math: `clampDay`, wheel↔ISO compose/decompose. |
| `features/transactions/wheelDate.test.ts` | Unit tests for the date math. |
| `features/preferences/types.ts` | `UserPreferences`, `DashboardSection`, section key union. |
| `features/preferences/api.ts` | `getMyPreferences()`, `upsertMyPreferences(settings)`. |
| `features/preferences/store.ts` | Zustand store for the current user's prefs. |
| `features/preferences/sync.ts` | `user preferences load hook` — load on `(app)` mount. |
| `features/preferences/layout.ts` | Pure: `resolveDashboardSections`, `moveItem`, `applyVisibility`. |
| `features/preferences/layout.test.ts` | Unit tests for the layout helpers. |
| `features/preferences/components/SectionLayoutEditor.tsx` | Drag-to-reorder + Вкл/Изкл rows for settings. |
| `supabase/migrations/<ts>_user_preferences.sql` | Table + RLS (applied via Supabase MCP `apply_migration`). |

### Modified files
| File | Change |
|---|---|
| `features/transactions/components/CategoryPickerModal.tsx` | Refactor onto `BottomSheet` (no behavior change). |
| `features/transactions/components/DateField.tsx` | Swap internals to `WheelDatePicker`; drop `datetimepicker` import. |
| `components/FloatingActionBar.tsx` | Add `placement`, `destructive` variant, per-action `loading`/`disabled`. |
| `app/manual-entry.tsx` | Готово/Запази → bottom FAB (keyboard-aware); remove top-right action. |
| `app/transaction/[id].tsx` | Replace `Alert` delete with `ConfirmSheet`; Изтрий/Редакция → bottom FABs. |
| `app/(app)/index.tsx` | Render `categories`/`recent` by resolved prefs order+visibility; `recent` slice → 3. |
| `app/(app)/_layout.tsx` | Mount the preferences load hook. |
| `app/(app)/profile.tsx` | New "Начало" section embedding `SectionLayoutEditor`. |
| `package.json` | Remove `@react-native-community/datetimepicker`. |

---

## Component & data-flow detail

### `BottomSheet`
Props: `{ visible, onClose, children }`. Renders the translucent backdrop + bottom-anchored `surface-container` panel + grabber + bottom safe-area currently inlined in `CategoryPickerModal`. Tap-scrim and Android back close it. Pure presentational.

### `ConfirmSheet`
Props: `{ visible, title, message?, confirmLabel, cancelLabel?, destructive?, onConfirm, onCancel }`. On `BottomSheet`: title (`headline-md`), optional message (`body-md`, muted), then a **pill** confirm button (full-width; `error-container`/`error` text when `destructive`) above a ghost pill cancel. Controlled — caller owns `visible` and the async work in `onConfirm`.

Detail-screen delete becomes: tap Изтрий → `setConfirmOpen(true)` → `onConfirm` runs `deleteTransaction` → `refreshTransactions` → `router.back()`; failure shows a second `ConfirmSheet`-style error or a simple inline message (no `Alert`).

### `WheelDatePicker` + `wheelDate.ts`
- `WheelDatePicker` props: `{ visible, value /* ISO */, onConfirm: (iso) => void, onClose }`. Three vertical snap `ScrollView`s (day, month, year) with a center highlight; "Готово" pill confirms, scrim/back cancels. Year range: `1970..currentYear+1`.
- Pure helpers (TDD):
  ```ts
  /** Days in a given month (1-based month). */
  export function daysInMonth(year: number, month: number): number;
  /** Clamp a day to the valid range for year/month (e.g. 31 in Feb -> 28/29). */
  export function clampDay(year: number, month: number, day: number): number;
  /** Compose a clamped YYYY-MM-DD from wheel parts. */
  export function partsToISO(year: number, month: number, day: number): string;
  /** Decompose an ISO date into {year, month, day} for seeding the wheels. */
  export function isoToParts(iso: string): { year: number; month: number; day: number };
  ```
  Changing month/year re-clamps the day (selecting Feb after day 31 snaps to 28/29).
- `DateField` keeps its row look; tapping opens `WheelDatePicker` instead of the native picker.

### `FloatingActionBar` extensions
- `placement?: 'aboveTabBar' | 'bottom'` — `aboveTabBar` keeps today's `insets.bottom + 88` clustered-center behavior; `bottom` pins at `insets.bottom + 16` and lays actions out **full-width, space-between** (single action → centered).
- `FloatingAction` adds `variant: 'filled' | 'ghost' | 'destructive'` (`destructive` = `error` fill / `error` content) and optional `loading?` (spinner, disables press) + `disabled?`.
- **Manual entry**: the bottom bar must sit **above the keyboard** while the amount field is focused — wrap in `KeyboardAvoidingView` (or a `Keyboard` listener raising `bottom`) so Готово is never occluded.

### Preferences data model
**Migration** (`apply_migration` via Supabase MCP; rename local file to the stamped version):
```sql
create table public.user_preferences (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  settings     jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);
alter table public.user_preferences enable row level security;
create policy user_preferences_rw on public.user_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```
**`settings` shape (v1):**
```jsonc
{
  "version": 1,
  "dashboardSections": [
    { "key": "categories", "visible": true },
    { "key": "recent",     "visible": true }
  ]
}
```
- `features/preferences/types.ts`: `DashboardSectionKey = 'categories' | 'recent'`, `DashboardSection = { key; visible }`, `UserPreferences = { version: 1; dashboardSections: DashboardSection[] }`.
- `api.ts`: `getMyPreferences()` selects the single row for `auth.uid()` (null when absent); `upsertMyPreferences(settings)` upserts `user_id`, `household_id`, `settings`. Follows the `{ error } -> throw` pattern.
- `store.ts`: holds `preferences: UserPreferences` (defaulted), `loaded`. `setPreferences`, `reset`.
- `sync.ts`: on `(app)` mount, fetch prefs and write the **resolved** value into the store; on failure, fall back to defaults (never block the UI).

### Pure layout helpers `features/preferences/layout.ts` (TDD)
```ts
export const DEFAULT_DASHBOARD_SECTIONS: DashboardSection[]; // categories, recent (both visible)

/** Normalize stored sections: keep stored order, append known-but-missing
 *  sections (visible), drop unknown keys. Forward/backward-safe. */
export function resolveDashboardSections(stored?: DashboardSection[] | null): DashboardSection[];

/** Immutably move an array item from one index to another. */
export function moveItem<T>(arr: T[], from: number, to: number): T[];

/** Toggle one section's visibility by key (immutable). */
export function setSectionVisible(
  sections: DashboardSection[], key: DashboardSectionKey, visible: boolean,
): DashboardSection[];
```

### Dashboard consumption (`app/(app)/index.tsx`)
- Read `preferences.dashboardSections` from the store; render each visible section in order. The hero + its toggles stay fixed above the configurable sections; the Последни header/Виж-всички stays attached to the `recent` section.
- `recent` slices to **3**.
- When prefs aren't loaded yet, render `DEFAULT_DASHBOARD_SECTIONS` (no flicker/empty home).

### Settings editor (`SectionLayoutEditor` in `profile.tsx`)
- Lists the resolved sections as draggable rows (drag handle `≡`), each with a `SegmentedToggle<'on'|'off'>` (Вкл/Изкл) on the right.
- Drag built on `Gesture.Pan()` (gesture-handler) + reanimated shared values over a fixed row height; drop commits via `moveItem`. Every reorder / visibility change calls `upsertMyPreferences` and updates the store optimistically.
- New "Начало" `SectionLabel` block in the existing Profile settings layout.

---

## Error handling
- `getMyPreferences` failure → defaults; never blocks home.
- `upsertMyPreferences` failure → revert the optimistic store change + a brief inline notice (no `Alert`).
- `deleteTransaction` failure (from `ConfirmSheet`) → inline error message, sheet stays dismissable; never crash.
- Wheel picker: cancel/scrim leaves the value unchanged; invalid combinations are impossible (day always clamped).

## Testing
- **Unit (TDD):**
  - `wheelDate.test.ts` — `daysInMonth`, `clampDay` (Feb/leap-year, 31→30), `partsToISO`/`isoToParts` round-trip.
  - `layout.test.ts` — `resolveDashboardSections` (empty→defaults, reordered passthrough, missing-key append, unknown-key drop), `moveItem` (bounds, no-op), `setSectionVisible`.
- **IO / UI** (`api`, sheets, FABs, drag) verified by `tsc` + `expo lint` + on-device.
- **Gates:** `npm run typecheck`, `npm run lint`, `npm test` all green.

## Implementation sequencing
- **A — Modals:** `BottomSheet` + refactor `CategoryPickerModal`; `ConfirmSheet` (wire detail delete); `WheelDatePicker` + `wheelDate.ts` (wire `DateField`); remove `datetimepicker`.
- **B — FABs + Последни→3:** `FloatingActionBar` extensions; manual-entry + detail relocations; dashboard slice.
- **C — Preferences:** migration → `api`/`store`/`sync`/`layout` (+ tests) → dashboard consumption → `SectionLayoutEditor` in settings.

## Verification checkpoint (human)
Delete a transaction → in-app confirm sheet with pill buttons → it disappears on both devices. Open the date field → wheel picker; Feb clamps day correctly. Manual-entry Готово is a bottom FAB visible above the keyboard; detail shows Изтрий (left, red) + Редакция (right). Dashboard shows max 3 Последни. In settings → Начало, hide По категория and move Последни above it → home reflects it; the other member's home is unaffected; relaunch keeps the layout.

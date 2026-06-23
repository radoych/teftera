# Day 6 — Transaction Detail, Edit/Delete, Pickers & Empty States (Design)

**Date:** 2026-06-23
**Branch:** `feat/day6-transaction-detail` (stacked on Day 5 / PR #4; rebase or merge onto `main` after #4 lands)
**Builds on:** Day 5 vertical slice (`features/transactions/{api,store,sync,schema,groupByDay}.ts`, `app/manual-entry.tsx`, live History + Dashboard).

## Goal

Make individual transactions inspectable and mutable: tap a row to open a read-only **detail screen**, **edit** it through a generalized manual-entry form (now with real category + date pickers), and **delete** it with confirmation. Add proper **empty states** across History, Dashboard, and Insights. All changes propagate through the existing realtime store.

## Scope decisions (locked during brainstorming)

1. **Edit reuses manual-entry** as a shared create/edit form — opened with a transaction `id` it prefills and saves via `updateTransaction`; without one it creates as today. The category + date pickers are built into this one form.
2. **Date picker:** `@react-native-community/datetimepicker` (Expo-supported, free, Expo Go compatible). Added via `expo install`.
3. **Category picker:** in-app `Modal` listing the household's categories (from the store) with icon/color — no dependency.
4. **Insights empty state:** gate the screen on the store's real transaction count — zero transactions → `EmptyState`; otherwise the existing static demo (until Day 12 wires real data).
5. **Member names** for "added-by" are fetched locally in the detail screen via the existing `getMembers` (not added to the store this slice).
6. **Create-mode category** still auto-suggests from the merchant via `guessCategory`, but a manual pick overrides and disables further auto-suggestion.

## Out of scope (deferred)

- Receipt thumbnail rendering beyond a guard (`receipt_id` is always `null` until Day 10 — show nothing when absent).
- Wiring Insights charts to real data (Day 12).
- Income / anomaly presentation (`flagReason` / `isIncome` — later days).
- Category management / creating new categories (Day 6 only selects among the seeded ones).

---

## Architecture & file plan

### New files
| File | Responsibility |
|---|---|
| `app/transaction/[id].tsx` | Read-only transaction detail screen (pushed route). |
| `components/EmptyState.tsx` | Shared empty-state block: icon + title + message + optional CTA. |
| `features/transactions/components/CategoryPickerModal.tsx` | Modal list of household categories; controlled select. |
| `features/transactions/components/DateField.tsx` | "Дата" row that opens the native date picker. |
| `features/transactions/edit.ts` | Pure helpers: `transactionToFormValues`, `memberName`. |
| `features/transactions/edit.test.ts` | Unit tests for the two pure helpers. |

### Modified files
| File | Change |
|---|---|
| `app/_layout.tsx` | Register `transaction/[id]` Stack screen (`slide_from_right`). |
| `app/manual-entry.tsx` | Generalize to create/edit; integrate CategoryPickerModal + DateField; mode from `id` param. |
| `features/transactions/api.ts` | Add `updateTransaction(id, fields)` and `deleteTransaction(id)`. |
| `features/transactions/components/TransactionRow.tsx` | Already has `onPress` — no change; callers pass navigation. |
| `app/(app)/history.tsx` | Row `onPress` → detail route; use `EmptyState`. |
| `app/(app)/index.tsx` | Recent-row `onPress` → detail route; use `EmptyState`. |
| `app/(app)/insights.tsx` | Gate on `transactions.length === 0` → `EmptyState`. |
| `package.json` | `@react-native-community/datetimepicker` (via `expo install`). |

---

## Component & data-flow detail

### Navigation flow
```
History/Dashboard row  --onPress-->  /transaction/<id>   (push, read-only)
   /transaction/<id>   --Редакция-->  /manual-entry?id=<id>   (edit mode)
   /transaction/<id>   --Изтрий---->  Alert confirm -> deleteTransaction -> refreshTransactions -> router.back()
   /manual-entry?id=<id>  --Запази--> updateTransaction -> refreshTransactions -> router.back()
   /manual-entry          --Готово--> createTransaction  -> refreshTransactions -> router.back()  (unchanged from Day 5)
```

The detail and edit screens **read the transaction from `useTransactionsStore` by id** rather than fetching — the realtime subscription keeps it current. If the lookup returns `undefined` (deleted elsewhere), the screen renders a short "Транзакцията не е намерена" state and offers a back action.

### `features/transactions/api.ts` additions
```ts
export interface TransactionPatch {
  amountCents: number;
  merchant: string;
  categoryId: string | null;
  date: string;      // YYYY-MM-DD
  note: string | null;
}

/** Update an existing transaction's editable fields. RLS scopes by household. */
export async function updateTransaction(id: string, patch: TransactionPatch): Promise<void>;

/** Delete a transaction by id. RLS scopes by household. */
export async function deleteTransaction(id: string): Promise<void>;
```
Both follow the established pattern (`{ error } = await supabase...; if (error) throw error`). `updateTransaction` updates only the editable columns (`amount_eur`, `merchant`, `category_id`, `date`, `note`) — it never touches `household_id`, `user_id`, `original_amount`, `original_currency`, `receipt_id`.

### Pure helpers `features/transactions/edit.ts`
```ts
import type { Transaction } from './types';

export interface ManualEntryFormValues {
  amount: string;       // major-unit string for the input, e.g. "12,50"
  merchant: string;
  note: string;         // '' when none
  date: string;         // YYYY-MM-DD
  categoryId: string | null;
}

/** Map a stored transaction to prefilled create/edit form values. */
export function transactionToFormValues(tx: Transaction): ManualEntryFormValues;

/** Resolve a member display name from a user id; null user id -> 'Импорт'. */
export function memberName(
  userId: string | null,
  members: ReadonlyArray<{ userId: string; displayName: string }>,
): string;
```
- `transactionToFormValues` converts `amount_eur` (cents) to the bg-BG major-unit string the amount input expects (comma decimal, two places), and passes `merchant`, `date`, `categoryId`, and `note ?? ''` through.
- `memberName` returns the matching member's `displayName`, `'Импорт'` when `userId` is `null` (bank-imported rows), and `'—'` when a non-null id isn't in the members list. Both pure → unit-tested.

### `CategoryPickerModal`
Props: `{ visible, categories, selectedId, onSelect, onClose }`. Renders a bottom-anchored `Modal` (translucent backdrop, `surface-container` panel) listing each category as an icon-circle (its `color`) + name, the selected one marked (check). Selecting calls `onSelect(id)` and closes. Pure presentational; no store access.

### `DateField`
Props: `{ value: string /* ISO */, onChange: (iso: string) => void, label?: string }`. Renders the existing "Дата" `FieldRow` look showing `relativeDay(value)`; tapping opens `@react-native-community/datetimepicker` (`mode="date"`, `display` platform-default). On change, converts the JS `Date` to ISO via `toISODate` and calls `onChange`. Android auto-dismisses; iOS shows inline/spinner with a done affordance.

### `manual-entry.tsx` generalization
- Reads `const { id } = useLocalSearchParams<{ id?: string }>()`. `isEdit = !!id`.
- State adds `categoryId: string | null` and `date: string` (ISO) alongside the existing amount/merchant/note.
- **Create mode:** `date` defaults to `toISODate()`; `categoryId` is `null` and the Category row shows the live `guessCategory(merchant)` suggestion until the user opens the picker and chooses (a `categoryTouched` flag then freezes it).
- **Edit mode:** on mount, look up the tx in the store by `id`; if found, seed state from `transactionToFormValues(tx)` and set `categoryTouched = true` (respect the stored category). If not found, render the not-found state.
- Header title + primary action label switch on mode ("Ръчно въвеждане" / "ГОТОВО" vs "Редактиране" / "ЗАПАЗИ").
- **Save:** validate via the existing `parseManualEntry({ amount, merchant, note, date })`; resolve `categoryId` (manual selection wins, else `resolveCategoryId(merchant, categories)`); then `updateTransaction(id, patch)` (edit) or `createTransaction(...)` (create); on success `await refreshTransactions(householdId)` then `router.back()`; on failure `setSaving(false)` + Bulgarian `Alert`. The household guard and saving/disabled behavior from Day 5 are preserved.

### Detail screen `app/transaction/[id].tsx`
- `const { id } = useLocalSearchParams()`; `tx = useTransactionsStore(s => s.transactions.find(t => t.id === id))`; `categories` from the store; resolve the category view (icon/color/name) the same way `toTransactionView` does. Fetch household members once via `getMembers(householdId)` to resolve "added-by" with `memberName`.
- Layout (flat, design-system tokens): top bar (back + title) · hero amount (`formatCurrency`) · category chip · rows for Дата, Бележка, Добавено от (member), and — only when `tx.receipt_id` — a receipt thumbnail (none in this slice). Bottom actions: **Редакция** (outline pill → edit) and **Изтрий** (text/error-colored → Alert confirm → `deleteTransaction(id)` → `refreshTransactions` → `router.back()`).
- Not-found state when `tx` is `undefined`.

### `EmptyState` component
Props: `{ icon: MaterialIconName, title: string, message?: string, cta?: { label: string, onPress: () => void } }`. Centered icon-in-circle, title (headline-md), optional message (body-md, muted), optional pill CTA. Used by History ("no transactions yet" + "Добави" CTA → manual-entry), Dashboard (compact), and Insights ("no data yet").

---

## Error handling
- `updateTransaction` / `deleteTransaction` throw on Supabase error; callers wrap in try/catch and show a Bulgarian `Alert` ("Грешка" / context message); never crash.
- Detail & edit screens handle a missing transaction (deleted elsewhere) with a not-found state, not a crash.
- Date picker dismissal (Android back / iOS cancel) leaves the value unchanged.

## Testing
- **Unit (`features/transactions/edit.test.ts`):** `transactionToFormValues` (cents→"12,50" string, note `null`→`''`, fields passthrough) and `memberName` (match → name, `null`→"Импорт", unknown id→"—").
- IO (`update`/`deleteTransaction`), screens, and pickers are verified by `tsc` + `expo lint` + manual on-device (consistent with Day 5).
- **Gates:** `npm run typecheck`, `npm run lint`, `npm test` all green.

## Verification checkpoint (human)
Tap a transaction → detail opens with correct fields and added-by. Edit it (change amount, category via picker, date via native picker) → save → list + dashboard reflect the change (and the other device via realtime). Delete it → confirm → it disappears on both devices. Fresh household → History/Dashboard/Insights show empty states.

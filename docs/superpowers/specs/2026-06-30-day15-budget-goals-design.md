# Day 15 — Budget Goals — Design

Date: 2026-06-30
Status: Approved (pending implementation plan)

Personal finance app for a shared two-person household. Day 15 adds monthly
category budgets, budget progress on Dashboard + Insights, and an 80%/over-budget
**local** notification fired client-side after each transaction save.

---

## Decisions (locked)

1. **Alert channel: local notifications only.** No Telegram, no server push.
   The threshold is evaluated client-side after each save (the same hook point as
   the Day 13 anomaly `runDetection`) and delivered via `expo-notifications` as an
   immediate local notification. This notifies the device that saved the
   transaction; the other household member is not pinged. Accepted for v1.
2. **Carry-forward budgets.** A budget set for a category applies to that month and
   every later month until edited. Reads resolve to the current-month row, else the
   most recent prior row. Setup writes/updates the current month's row only.
3. **Household-scoped.** Both the budget limit and the actual spend are
   household-wide. Budget progress **ignores** the per-person/household toggle on
   Dashboard and Insights and always shows household totals — showing one person's
   spend against a shared budget is misleading. (Same fixed-scope convention as the
   Day 14 AI summary.)
4. **`expo-notifications`** is a new but free dependency — no paid-dep concern.

## Deferred (out of scope for Day 15)

- Telegram backup notification channel (isolated behind `notify.ts` so it can be
  added in one file later).
- True server-sent push (no backend until Day 16).
- Budget alerting on DSK **bulk import** — consistent with Day 13 excluding DSK
  rows from anomaly scoring; bulk historical rows would fire noisy alerts.
- Migrating manual-entry / confirm-receipt to the shared `AmountInput` (this spec
  introduces the component and uses it on the budgets screen; rolling it out to the
  other amount inputs — and thereby closing the Day 11.5 auto-decimal TODO fully —
  can follow).

---

## Data layer

The `budgets` table already exists and needs **no migration**:

```
budgets  id, household_id, category_id, amount_eur (int cents),
         month (date = first of month), created_at,
         unique (household_id, category_id, month)
```

RLS is already the household-CRUD policy.

### `features/budgets/api.ts` (thin Supabase layer)
- `fetchBudgets(householdId)` — all budget rows for the household (small set).
- `upsertBudget(householdId, categoryId, amountCents, month)` — upsert on the
  unique key for the **current month**. Clearing the amount (0 / empty) deletes the
  row for that month.

### `features/budgets/resolve.ts` (pure, tested)
- `resolveBudgetsForMonth(rows, month) -> Map<categoryId, amountCents>`
  For each category, pick the row matching `month`; else the most recent row with
  `month < target`. Single source of truth for "active budget this month," shared by
  Dashboard, Insights, and the alert check.

### `features/budgets/progress.ts` (pure, tested)
- `budgetProgress(resolvedBudgets, spendByCategory) -> BudgetProgress[]`
  where each entry is `{ categoryId, budgetCents, spentCents, pct, state }` and
  `state ∈ 'under' | 'warning' (pct >= 80) | 'over' (pct > 100)`.
  Spend comes from the existing `categoryBreakdown` output.

All budget math is pure and isolated from React/Supabase.

---

## Budget setup UI

**Entry point:** Profile → new row "Управление на бюджети" (Manage budgets) →
navigates to `app/budgets.tsx` (a non-tab screen, like `import-dsk.tsx`).

The existing cosmetic "Бюджетни сигнали" toggle on Profile is wired to gate whether
local notifications fire. The enabled flag lives in the existing
`features/preferences` slice (`usePreferencesStore` + its `api`/`sync`), not a new
store — it is a real synced preference, unlike the per-device dedup markers.

**`app/budgets.tsx`:**
- Lists all household categories (icon + name), each with an editable monthly amount.
- Starting value = the **resolved** current-month budget (carried-forward budgets
  appear pre-filled).
- Amount entry uses a new shared **`AmountInput`** component: `decimal-pad`,
  cents-based with auto-decimal placement (typing `200` → `2,00`), stored as integer
  cents. Reuses the parsing approach from `parseManualEntry`.
- Empty field = no budget for that category (deletes the current-month row).
- Single "Save" action via `FloatingActionBar` (one centered pill, per the
  action-row rule).
- On first save with alerts enabled, request notification permission. If denied,
  budgets still work — just no local alerts.

---

## Display

### Dashboard (`app/(app)/index.tsx`)
In the existing "spending by category" section, **budgeted** categories show a
**budget progress bar** (spent vs budget, labelled `€160 / €200`) instead of the
plain proportional bar:
- normal → `primary-container`
- warning (≥80%) → a muted alert tone
- over-budget (>100%) → `error`

The lime `secondary-fixed` stays reserved for anomalies only. Non-budgeted
categories keep today's proportional bar. Always household-scoped (ignores the
person toggle).

### Insights (`app/(app)/insights.tsx`)
New **"Бюджет / Budget vs Actual"** section: each budgeted category shows budget,
actual, remaining (or overspend), and the same progress bar. Fixed to **current
month + household** — the range/person pills do not rescope it (keeps the displayed
bar and the alert threshold in agreement). Shown only when at least one budget
exists; otherwise an empty hint to set budgets.

Both surfaces reuse the single `budgetProgress` helper, so the bars and the 80%
alert can never disagree.

---

## Alert evaluation, delivery & dedup

### `runBudgetCheck(...)` (new, in `features/budgets/`)
Called right after a successful save in `app/manual-entry.tsx` and
`app/confirm-receipt.tsx` — the same call sites as `runDetection`. Best-effort,
wrapped in try/catch: a notification failure never blocks or crashes the save.

Logic:
1. Skip if the "Бюджетни сигнали" preference is off.
2. Load budgets + current-month household spend; run `budgetProgress`.
3. For the saved transaction's category, if it **crossed into `warning` (≥80%)** or
   **`over` (>100%)** as a result of this save, and we have not already alerted for
   that `(category, month, threshold)`, fire a local notification and record the
   marker.

### Dedup marker
Persisted **locally per device** (Zustand + AsyncStorage), keyed
`householdId:categoryId:YYYY-MM:threshold`. Local is correct because notifications
are per-device anyway; no schema change, and it resets naturally each month. The two
thresholds (80, 100) each fire once per category per month.

### `features/budgets/notify.ts`
Wraps `expo-notifications`: permission request + `scheduleNotificationAsync` with an
immediate trigger. Isolated so the channel can later swap to push/Telegram in one
file (same isolation principle CLAUDE.md applies to Gemini).

Notification copy (bg-BG): e.g. `Бюджет: Хранителни стоки — €160 от €200 (80%)`;
over-budget variant for >100%.

---

## Testing

Pure unit tests (Jest), matching the existing slices:
- `resolveBudgetsForMonth` — current-month hit, carry-forward fallback, no budget.
- `budgetProgress` — under / warning / over boundaries at exactly 80% and 100%.
- `runBudgetCheck` crossing + dedup decision — didn't-cross, just-crossed,
  already-alerted, alerts-disabled — with the notify + persistence layers mocked.

The Supabase `api`, the screens, and `expo-notifications` stay thin and are covered
by the on-device checkpoint.

---

## Checkpoint (from the build plan)

Set a €200 Groceries budget. Spend €160 → get a (local) notification. Dashboard
shows the progress bar at 80%.

## File map

```
features/budgets/
  api.ts            fetchBudgets, upsertBudget          (thin Supabase)
  resolve.ts        resolveBudgetsForMonth              (pure, tested)
  progress.ts       budgetProgress                      (pure, tested)
  runBudgetCheck.ts crossing detection + dedup          (tested, layers mocked)
  notify.ts         expo-notifications wrapper          (thin)
  alertStore.ts     per-device dedup markers (persisted)
app/budgets.tsx     budget setup screen
components/AmountInput.tsx   shared cents/auto-decimal input
```

Edits: `app/(app)/profile.tsx` (entry row + wire the toggle),
`app/(app)/index.tsx` (dashboard bars), `app/(app)/insights.tsx` (budget section),
`app/manual-entry.tsx` + `app/confirm-receipt.tsx` (call `runBudgetCheck` after save).

# Day 13 — Anomaly Detection

**Date:** 2026-06-28
**Status:** Approved design, ready for implementation plan
**Build plan:** Day 13 (Phase 5 — Intelligence)

---

## Goal

Flag unusual spending automatically. When a transaction is saved, score its amount
against its category's history; if it is an outlier (|Z| > 2.5), mark it flagged and
record an anomaly. Flagged transactions render with the lime anomaly accent in the
history list and appear in a real Anomalies section on Insights, where a "Review" action
clears the flag.

## Context — what already exists

- **`services/anomaly.ts`** — the full, unit-tested Z-score engine: `mean`, `stdDev`,
  `zScore`, and `scoreTransaction(amountCents, history, threshold = 2.5)` →
  `{ score, isAnomaly, reason }`. It never flags below `MIN_SAMPLE = 4` and returns a
  Bulgarian reason ("Над/Под обичайното за тази категория (z=…)"). **Reused unchanged.**
- **DB:** `anomalies` table (`id, household_id, transaction_id, reason, score, reviewed,
  created_at`) and `transactions.is_flagged` column already exist, with RLS. No migration
  needed.
- **`TransactionRow`** already renders the flagged state fully: a lime dot on the icon, a
  "Маркирана" chip, lime amount text, and a `flagReason` label. It is driven by
  `TransactionView.isFlagged` / `.flagReason`.
- **`toTransactionView`** already maps `isFlagged: tx.is_flagged`, but leaves `flagReason`
  unset (deferred to this day).
- **Save paths:** `createTransaction` (`features/transactions/api.ts`) returns `void` today.
  Manual entry (`app/manual-entry.tsx` `onSave`) and the receipt flow
  (`features/receipts/save.ts` `saveReceiptTransaction`) both call it, then
  `refreshTransactions(householdId)`.
- **Store/sync:** `refreshTransactions` runs `Promise.all([listCategories, listTransactions])`
  then `useTransactionsStore.setData(transactions, categories)`. The realtime channel
  refetches the whole list on any transaction change (so an `is_flagged` flip on one device
  triggers a refetch on the other).

## Locked decisions

1. **Automatic on each new save.** After a successful manual or receipt insert, score the
   new transaction and persist a flag if it is anomalous. No manual "Analyze" button in v1.
2. **Household-scoped, amount-only.** History = the household's transactions in the same
   category (the saver's device runs detection). Only the amount Z-score; no "high
   frequency" detector.
3. **Persist flags (not recompute-on-the-fly).** Detection writes `is_flagged = true` + an
   `anomalies` row. Flags survive, sync across devices via the existing channel, and the
   "reviewed" decision sticks.
4. **Best-effort, never blocks a save.** Detection is fully wrapped; a scoring/persist
   failure logs in dev and is swallowed — the transaction is already saved.
5. **Detect on create only.** Not on edit; DSK bulk imports are not scored (they would flag
   many rows at once).

## Data flow

```
manual-entry onSave / saveReceiptTransaction
        │  createTransaction(...) → { id }     (now returns the new id)
        │  await refreshTransactions(householdId)
        ▼
runDetection({ transactionId: id, householdId, amountCents, categoryId, transactions })
  history = historyForCategory(transactions, categoryId, excludeId = id)
  result  = scoreTransaction(amountCents, history)          // existing engine
        │ result.isAnomaly
        ▼
  flagTransaction(id)              → transactions.is_flagged = true
  insertAnomaly({ householdId, transactionId: id, reason, score })
        │
  realtime (is_flagged change) → both devices refetch → flag + reason visible
```

Reviewing:
```
Insights "Прегледай" on an open anomaly
  → markReviewed(anomalyId, transactionId)
      anomalies.reviewed = true   AND   transactions.is_flagged = false
  → refreshTransactions → row un-flagged, anomaly leaves the section
```

## Components (one responsibility each)

**`features/anomalies/detect.ts`** (pure, tested; no DB):
- `historyForCategory(txs: Transaction[], categoryId: string | null, excludeId: string): number[]`
  — `amount_eur` of household txs in the same category, excluding the scored tx.
- `evaluate(amountCents: number, history: number[]): AnomalyResult` — thin delegation to
  `scoreTransaction` (re-exported result type from `services/anomaly`).

**`features/anomalies/api.ts`** — the only module that reads/writes `anomalies` and toggles
`is_flagged`:
- `insertAnomaly(input: { householdId; transactionId; reason; score }): Promise<void>`
- `flagTransaction(transactionId: string): Promise<void>` — sets `is_flagged = true`.
- `interface OpenAnomaly { id: string; transactionId: string; reason: string; score: number | null }`
- `listOpenAnomalies(householdId: string): Promise<OpenAnomaly[]>` — `reviewed = false` rows.
- `markReviewed(anomalyId: string, transactionId: string): Promise<void>` — sets
  `reviewed = true` and `is_flagged = false` (two writes; transaction un-flag second).

**`features/anomalies/runDetection.ts`**:
- `runDetection(input: { transactionId; householdId; amountCents; categoryId: string | null;
  transactions: Transaction[] }, deps?): Promise<void>` — `transactions` is the current
  household list (the caller passes `useTransactionsStore.getState().transactions` after the
  refresh, so it already includes the new row). Builds history via
  `historyForCategory(transactions, categoryId, transactionId)`, calls `evaluate`, and on a
  flag calls `flagTransaction` + `insertAnomaly`. Entirely wrapped in try/catch (dev-warn
  only). `deps` defaults to the real implementations; tests inject fakes (mirrors
  `saveReceiptTransaction`).

**`features/transactions/api.ts`** — `createTransaction` returns `{ id: string }` via
`.select('id').single()`. (`NewTransaction` input unchanged.)

**Reason mapping** (`features/anomalies/reasons.ts`, pure):
- `reasonByTxId(open: OpenAnomaly[]): Map<string, string>` — `transactionId → reason`.

## Store & view changes

- `useTransactionsStore`: add `openAnomalies: OpenAnomaly[]` (default `[]`); `setData`
  gains a third arg `openAnomalies`; `reset` clears it.
- `refreshTransactions`: add `listOpenAnomalies(householdId)` to the `Promise.all` and pass
  it to `setData`. (One extra query; piggybacks on the existing realtime refetch.)
- `toTransactionView(tx, byId, now, reasonByTxId?)` — new optional last param (default empty
  Map); sets `flagReason` from it when the tx is flagged. Existing callers keep working.
- `groupTransactionsByDay(txs, categories, now, reasonByTxId?)` — threads the map to
  `toTransactionView`.
- **History screen** + **dashboard "recent"** build the map from `store.openAnomalies`
  (`reasonByTxId`) and pass it through.

## UI: Insights anomaly section

Replace the static `ANOMALIES` constant and JSX with real data:
- Source: `store.openAnomalies` joined to `store.transactions` by `transactionId` for
  merchant + `amount_eur`; reason from the anomaly row. Skip any anomaly whose transaction
  is no longer in the list.
- Each card keeps the existing lime-accent styling and adds a **"Прегледай"** action →
  `markReviewed(anomalyId, transactionId)` → `refreshTransactions`.
- When there are no open anomalies, hide the section (no empty placeholder needed).

## Testing (TDD)

Pure helpers and orchestration are unit-tested; screens are UI (no render test, per
convention).

- `features/anomalies/detect.test.ts`: `historyForCategory` isolates by category and
  excludes the scored id; `evaluate` flags a 3× outlier above the 4-sample minimum and
  returns `isAnomaly:false` below it (delegation sanity).
- `features/anomalies/runDetection.test.ts` (injected fakes): an anomalous score calls
  `flagTransaction` + `insertAnomaly` with the right args; a normal score persists nothing;
  a thrown persist error is swallowed (resolves, does not reject).
- `features/anomalies/reasons.test.ts`: `reasonByTxId` builds the correct map (and
  `toTransactionView` populates `flagReason` from it for a flagged tx, leaves it undefined
  for an unflagged tx).
- `features/anomalies/api.test.ts` is NOT added (thin Supabase writers; covered via the
  orchestration tests with fakes, mirroring `receipts/api.ts`).

## Out of scope (v1)

Re-scoring on edit; scoring DSK bulk imports; the "high frequency" detector; a dedicated
anomalies realtime channel (reasons refresh on the existing transactions refetch; the
`is_flagged` dot already syncs live); and a Review action on the transaction-detail screen
(Insights only, per the plan).

## Checkpoint

Add a transaction that is ~3× your average for a category (with ≥4 prior in that category).
It immediately renders flagged (lime dot + "Маркирана" + reason) in the history list and
appears in the Insights Anomalies section. Tapping "Прегледай" clears the flag and removes
it from the section.

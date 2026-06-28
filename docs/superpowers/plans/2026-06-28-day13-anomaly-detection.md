# Day 13 — Anomaly Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically flag outlier transactions on save (per-category Z-score), persist a flag + an `anomalies` row, surface the reason in the history list, and show real anomalies on Insights with a Review action that clears the flag.

**Architecture:** A new `features/anomalies/` slice wraps the existing tested Z-score engine: pure `detect` helpers, thin Supabase writers/readers in `api`, and a best-effort `runDetection` orchestrator (injected deps) called from the two save screens after a successful insert. `createTransaction`/`saveReceiptTransaction` return the new id; the store loads open anomalies alongside transactions so flag reasons render and sync via the existing realtime refetch.

**Tech Stack:** React Native + Expo, TypeScript strict, Supabase JS, Zustand, Jest (`jest-expo`).

## Global Constraints

- **Money = integer EUR cents.** Never float arithmetic; all display via `formatCurrency`.
- **Reuse the existing engine.** `services/anomaly.ts` (`scoreTransaction`, threshold 2.5, `MIN_SAMPLE = 4`) is unchanged. Do not re-implement scoring.
- **Detect on create only**, automatically after manual + receipt saves; **household-scoped, amount-only**. No edit re-scoring, no DSK-import scoring, no "high frequency" detector, no manual Analyze button.
- **Best-effort detection.** `runDetection` never throws — a scoring/persist failure logs in dev and is swallowed; the transaction is already saved.
- **Persist flags:** set `transactions.is_flagged = true` + insert an `anomalies` row. Mark-reviewed sets `anomalies.reviewed = true` AND `is_flagged = false`. No DB migration (table + column already exist).
- **Lime `secondary-fixed` (`#c3f400`) is the anomaly accent** — that is exactly this feature's use.
- **UI copy Bulgarian.** TypeScript strict; no `any`; no plain `.js`.
- **Conventional commits**; every commit ends with the trailer below.
- Verification: `npm test`, `npx tsc --noEmit`, `npm run lint`. The `env: load .env` header printed by lint/test is normal.

Commit trailer for every commit:
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## File Structure

- `features/transactions/api.ts` — **modify**: `createTransaction` returns `{ id }`.
- `features/receipts/save.ts` — **modify**: `saveReceiptTransaction` returns `{ id }`.
- `features/receipts/save.test.ts` — **modify**: fake `createTransaction` returns `{ id }`; assert the returned id.
- `features/anomalies/detect.ts` (+ `.test.ts`) — **create**: `historyForCategory`, `evaluate`.
- `features/anomalies/api.ts` — **create**: `insertAnomaly`, `flagTransaction`, `listOpenAnomalies`, `markReviewed`, `OpenAnomaly`/`NewAnomaly` types.
- `features/anomalies/runDetection.ts` (+ `.test.ts`) — **create**: best-effort orchestrator.
- `features/anomalies/reasons.ts` (+ `.test.ts`) — **create**: `reasonByTxId`.
- `features/transactions/groupByDay.ts` — **modify**: `toTransactionView` / `groupTransactionsByDay` accept a `reasons` map → populate `flagReason`.
- `features/transactions/groupByDay.test.ts` — **modify**: reason-map tests.
- `features/transactions/store.ts` — **modify**: add `openAnomalies`.
- `features/transactions/sync.ts` — **modify**: load `listOpenAnomalies`.
- `app/manual-entry.tsx`, `app/confirm-receipt.tsx` — **modify**: call `runDetection` after a create.
- `app/(app)/history.tsx`, `app/(app)/index.tsx`, `app/(app)/insights.tsx` — **modify**: pass reasons / real anomaly section.
- `teftera-build-plan.md` — **modify**: check off Day 13.

---

## Task 1: Return the new transaction id from the save paths

**Files:**
- Modify: `features/transactions/api.ts`
- Modify: `features/receipts/save.ts`
- Test: `features/receipts/save.test.ts`

**Interfaces:**
- Produces: `createTransaction(input): Promise<{ id: string }>`; `saveReceiptTransaction(input, deps?): Promise<{ id: string }>` (returns the transaction id).

- [ ] **Step 1: Update the failing test**

In `features/receipts/save.test.ts`, change the `createTransaction` fake in BOTH tests to return an id, and assert the returned value in the first test. Replace the first test's fakes + call with:
```ts
  it('inserts the receipt first, then the transaction linked by receipt_id', async () => {
    const calls: string[] = [];
    const insertReceipt = jest.fn(async () => {
      calls.push('receipt');
      return { id: 'receipt-1' };
    });
    const createTransaction = jest.fn(async () => {
      calls.push('transaction');
      return { id: 'tx-1' };
    });

    const result = await saveReceiptTransaction(input, { insertReceipt, createTransaction });

    expect(result).toEqual({ id: 'tx-1' });
    expect(calls).toEqual(['receipt', 'transaction']);
    expect(insertReceipt).toHaveBeenCalledWith({
      householdId: 'H',
      userId: 'U',
      storagePath: 'H/abc.jpg',
      rawGeminiJson: { merchant: 'Kaufland' },
    });
    expect(createTransaction).toHaveBeenCalledWith({
      householdId: 'H',
      userId: 'U',
      amountCents: 1420,
      merchant: 'Kaufland',
      categoryId: 'cat-groceries',
      date: '2026-06-20',
      note: 'Кафе, Мъфин',
      receiptId: 'receipt-1',
    });
  });
```
And in the second test ("does not create a transaction when the receipt insert fails"), change its `createTransaction` fake to:
```ts
    const createTransaction = jest.fn(async () => ({ id: 'tx-1' }));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest features/receipts/save.test.ts`
Expected: FAIL — `result` is `undefined` (not `{ id: 'tx-1' }`) / type error.

- [ ] **Step 3: Implement**

In `features/transactions/api.ts`, change `createTransaction` to return the id:
```ts
/** Insert one expense. EUR-native, so original_amount/currency stay null. Returns the new id. */
export async function createTransaction(input: NewTransaction): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      household_id: input.householdId,
      user_id: input.userId,
      amount_eur: input.amountCents,
      original_amount: null,
      original_currency: null,
      merchant: input.merchant,
      category_id: input.categoryId,
      date: input.date,
      note: input.note,
      receipt_id: input.receiptId ?? null,
      source: input.receiptId ? 'receipt' : 'manual',
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: (data as { id: string }).id };
}
```
In `features/receipts/save.ts`, change `saveReceiptTransaction` to return the id (replace its final lines):
```ts
export async function saveReceiptTransaction(
  input: SaveReceiptInput,
  deps: SaveReceiptDeps = defaultDeps,
): Promise<{ id: string }> {
  const receipt: NewReceipt = {
    householdId: input.householdId,
    userId: input.userId,
    storagePath: input.storagePath,
    rawGeminiJson: input.rawGeminiJson,
  };
  const { id: receiptId } = await deps.insertReceipt(receipt);

  const transaction: NewTransaction = {
    householdId: input.householdId,
    userId: input.userId,
    amountCents: input.amountCents,
    merchant: input.merchant,
    categoryId: input.categoryId,
    date: input.date,
    note: input.note,
    receiptId,
  };
  return deps.createTransaction(transaction);
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx jest features/receipts/save.test.ts && npx tsc --noEmit`
Expected: PASS — both save tests green; tsc clean (callers ignoring the return value still compile).

- [ ] **Step 5: Commit**

```bash
git add features/transactions/api.ts features/receipts/save.ts features/receipts/save.test.ts
git commit -m "$(cat <<'EOF'
feat(transactions): createTransaction returns the new id

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Detection helpers (`features/anomalies/detect.ts`)

**Files:**
- Create: `features/anomalies/detect.ts`
- Test: `features/anomalies/detect.test.ts`

**Interfaces:**
- Consumes: `scoreTransaction`, `AnomalyResult` from `@/services/anomaly`; `Transaction` from `@/features/transactions/types`.
- Produces:
  - `historyForCategory(txs: Transaction[], categoryId: string | null, excludeId: string): number[]`
  - `evaluate(amountCents: number, history: number[]): AnomalyResult`

- [ ] **Step 1: Write the failing test**

Create `features/anomalies/detect.test.ts`:
```ts
import type { Transaction } from '@/features/transactions/types';
import { evaluate, historyForCategory } from './detect';

function tx(p: Partial<Transaction> & { id: string }): Transaction {
  return {
    id: p.id, household_id: 'h', user_id: 'u', amount_eur: 1000,
    original_amount: null, original_currency: null, merchant: 'M',
    category_id: 'c1', date: '2026-06-01', note: null, source: 'manual',
    receipt_id: null, is_flagged: false, occurred_at: null,
    created_at: '2026-06-01T00:00:00.000Z', ...p,
  };
}

describe('historyForCategory', () => {
  it('keeps same-category amounts and excludes the scored tx', () => {
    const txs = [
      tx({ id: 'a', category_id: 'c1', amount_eur: 100 }),
      tx({ id: 'b', category_id: 'c1', amount_eur: 200 }),
      tx({ id: 'c', category_id: 'c2', amount_eur: 999 }),
      tx({ id: 'self', category_id: 'c1', amount_eur: 5000 }),
    ];
    expect(historyForCategory(txs, 'c1', 'self')).toEqual([100, 200]);
  });
  it('matches the uncategorized (null) bucket', () => {
    const txs = [tx({ id: 'a', category_id: null, amount_eur: 100 }), tx({ id: 'b', category_id: 'c1' })];
    expect(historyForCategory(txs, null, 'x')).toEqual([100]);
  });
});

describe('evaluate', () => {
  it('flags a 3x outlier once there are >= 4 prior samples', () => {
    const r = evaluate(3000, [800, 1000, 1200, 1000]);
    expect(r.isAnomaly).toBe(true);
    expect(r.reason).not.toBeNull();
  });
  it('does not flag below the minimum sample size', () => {
    const r = evaluate(9999, [800, 1000, 1200]);
    expect(r.isAnomaly).toBe(false);
    expect(r.reason).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest features/anomalies/detect.test.ts`
Expected: FAIL — cannot find module `./detect`.

- [ ] **Step 3: Implement**

Create `features/anomalies/detect.ts`:
```ts
import { scoreTransaction, type AnomalyResult } from '@/services/anomaly';
import type { Transaction } from '@/features/transactions/types';

/** `amount_eur` of household txs in the same category, excluding the scored tx. */
export function historyForCategory(
  txs: Transaction[],
  categoryId: string | null,
  excludeId: string,
): number[] {
  return txs
    .filter((tx) => tx.id !== excludeId && tx.category_id === categoryId)
    .map((tx) => tx.amount_eur);
}

/** Score one amount against a category's historical amounts (delegates to the engine). */
export function evaluate(amountCents: number, history: number[]): AnomalyResult {
  return scoreTransaction(amountCents, history);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest features/anomalies/detect.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/anomalies/detect.ts features/anomalies/detect.test.ts
git commit -m "$(cat <<'EOF'
feat(anomalies): category-history + evaluate detection helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Anomaly persistence + orchestration

**Files:**
- Create: `features/anomalies/api.ts`
- Create: `features/anomalies/runDetection.ts`
- Test: `features/anomalies/runDetection.test.ts`

**Interfaces:**
- Consumes: `supabase`; `historyForCategory`, `evaluate` from `./detect`; `Transaction` from `@/features/transactions/types`.
- Produces:
  - `interface NewAnomaly { householdId: string; transactionId: string; reason: string; score: number }`
  - `interface OpenAnomaly { id: string; transactionId: string; reason: string; score: number | null }`
  - `insertAnomaly(input: NewAnomaly): Promise<void>`; `flagTransaction(transactionId: string): Promise<void>`; `listOpenAnomalies(householdId: string): Promise<OpenAnomaly[]>`; `markReviewed(anomalyId: string, transactionId: string): Promise<void>`
  - `runDetection(input: { transactionId; householdId; amountCents; categoryId: string | null; transactions: Transaction[] }, deps?): Promise<void>` — never throws.

> `api.ts` has no unit test (thin Supabase writers, mirroring `receipts/api.ts`); its contract is exercised by the `runDetection` test via injected fakes. The gate for `api.ts` is `tsc`.

- [ ] **Step 1: Create `features/anomalies/api.ts`**

```ts
// features/anomalies/api.ts — the ONLY module that writes anomalies / toggles is_flagged.
import { supabase } from '@/services/supabase';

export interface NewAnomaly {
  householdId: string;
  transactionId: string;
  reason: string;
  score: number;
}

export interface OpenAnomaly {
  id: string;
  transactionId: string;
  reason: string;
  score: number | null;
}

/** Insert one anomaly row. */
export async function insertAnomaly(input: NewAnomaly): Promise<void> {
  const { error } = await supabase.from('anomalies').insert({
    household_id: input.householdId,
    transaction_id: input.transactionId,
    reason: input.reason,
    score: input.score,
  });
  if (error) throw error;
}

/** Mark a transaction flagged. */
export async function flagTransaction(transactionId: string): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .update({ is_flagged: true })
    .eq('id', transactionId);
  if (error) throw error;
}

/** Unreviewed anomalies for a household, newest first. */
export async function listOpenAnomalies(householdId: string): Promise<OpenAnomaly[]> {
  const { data, error } = await supabase
    .from('anomalies')
    .select('id, transaction_id, reason, score')
    .eq('household_id', householdId)
    .eq('reviewed', false)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    transactionId: r.transaction_id as string,
    reason: r.reason as string,
    score: (r.score as number | null) ?? null,
  }));
}

/** Mark an anomaly reviewed and clear the transaction's flag. */
export async function markReviewed(anomalyId: string, transactionId: string): Promise<void> {
  const { error: aErr } = await supabase
    .from('anomalies')
    .update({ reviewed: true })
    .eq('id', anomalyId);
  if (aErr) throw aErr;
  const { error: tErr } = await supabase
    .from('transactions')
    .update({ is_flagged: false })
    .eq('id', transactionId);
  if (tErr) throw tErr;
}
```

- [ ] **Step 2: Write the failing `runDetection` test**

Create `features/anomalies/runDetection.test.ts`:
```ts
import type { Transaction } from '@/features/transactions/types';
import { runDetection, type RunDetectionInput } from './runDetection';

function tx(p: Partial<Transaction> & { id: string }): Transaction {
  return {
    id: p.id, household_id: 'h', user_id: 'u', amount_eur: 1000,
    original_amount: null, original_currency: null, merchant: 'M',
    category_id: 'c1', date: '2026-06-01', note: null, source: 'manual',
    receipt_id: null, is_flagged: false, occurred_at: null,
    created_at: '2026-06-01T00:00:00.000Z', ...p,
  };
}

const history = [
  tx({ id: 'a', amount_eur: 800 }),
  tx({ id: 'b', amount_eur: 1000 }),
  tx({ id: 'c', amount_eur: 1200 }),
  tx({ id: 'd', amount_eur: 1000 }),
];

function input(amountCents: number): RunDetectionInput {
  return {
    transactionId: 'new',
    householdId: 'h',
    amountCents,
    categoryId: 'c1',
    transactions: [...history, tx({ id: 'new', amount_eur: amountCents })],
  };
}

describe('runDetection', () => {
  it('flags and records an anomaly for an outlier', async () => {
    const flagTransaction = jest.fn(async () => {});
    const insertAnomaly = jest.fn(async () => {});
    await runDetection(input(5000), { flagTransaction, insertAnomaly });
    expect(flagTransaction).toHaveBeenCalledWith('new');
    expect(insertAnomaly).toHaveBeenCalledTimes(1);
    const arg = insertAnomaly.mock.calls[0]![0];
    expect(arg.transactionId).toBe('new');
    expect(arg.householdId).toBe('h');
    expect(typeof arg.reason).toBe('string');
  });

  it('persists nothing for a normal amount', async () => {
    const flagTransaction = jest.fn(async () => {});
    const insertAnomaly = jest.fn(async () => {});
    await runDetection(input(1000), { flagTransaction, insertAnomaly });
    expect(flagTransaction).not.toHaveBeenCalled();
    expect(insertAnomaly).not.toHaveBeenCalled();
  });

  it('swallows a persist error (never rejects)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const flagTransaction = jest.fn(async () => {
      throw new Error('db down');
    });
    const insertAnomaly = jest.fn(async () => {});
    await expect(runDetection(input(5000), { flagTransaction, insertAnomaly })).resolves.toBeUndefined();
    expect(insertAnomaly).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest features/anomalies/runDetection.test.ts`
Expected: FAIL — cannot find module `./runDetection`.

- [ ] **Step 4: Implement `runDetection.ts`**

Create `features/anomalies/runDetection.ts`:
```ts
import type { Transaction } from '@/features/transactions/types';
import { evaluate, historyForCategory } from './detect';
import { flagTransaction, insertAnomaly } from './api';

export interface RunDetectionInput {
  transactionId: string;
  householdId: string;
  amountCents: number;
  categoryId: string | null;
  transactions: Transaction[];
}

export interface RunDetectionDeps {
  flagTransaction: typeof flagTransaction;
  insertAnomaly: typeof insertAnomaly;
}

const defaultDeps: RunDetectionDeps = { flagTransaction, insertAnomaly };

/**
 * Score a just-saved transaction against its category history and persist a flag
 * if it is anomalous. Best-effort: never throws — a failure here must not break
 * the save that already succeeded.
 */
export async function runDetection(
  input: RunDetectionInput,
  deps: RunDetectionDeps = defaultDeps,
): Promise<void> {
  try {
    const history = historyForCategory(input.transactions, input.categoryId, input.transactionId);
    const result = evaluate(input.amountCents, history);
    if (!result.isAnomaly || result.reason === null) return;
    await deps.flagTransaction(input.transactionId);
    await deps.insertAnomaly({
      householdId: input.householdId,
      transactionId: input.transactionId,
      reason: result.reason,
      score: result.score,
    });
  } catch (err) {
    if (__DEV__) console.warn('[anomaly] detection failed', err);
  }
}
```

- [ ] **Step 5: Run test + typecheck**

Run: `npx jest features/anomalies/runDetection.test.ts && npx tsc --noEmit`
Expected: PASS — 3/3 runDetection tests green, output pristine (the warn is mocked); tsc clean.

- [ ] **Step 6: Commit**

```bash
git add features/anomalies/api.ts features/anomalies/runDetection.ts features/anomalies/runDetection.test.ts
git commit -m "$(cat <<'EOF'
feat(anomalies): persistence API + best-effort runDetection orchestrator

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Reason map + flagReason wiring

**Files:**
- Create: `features/anomalies/reasons.ts`
- Test: `features/anomalies/reasons.test.ts`
- Modify: `features/transactions/groupByDay.ts`
- Test: `features/transactions/groupByDay.test.ts`

**Interfaces:**
- Consumes: `OpenAnomaly` from `@/features/anomalies/api`.
- Produces:
  - `reasonByTxId(open: OpenAnomaly[]): Map<string, string>`
  - `toTransactionView(tx, byId, now?, reasons?: Map<string, string>)` — sets `flagReason` from `reasons` for a flagged tx.
  - `groupTransactionsByDay(txs, categories, now?, reasons?: Map<string, string>)` — threads `reasons` through.

- [ ] **Step 1: Write the failing tests**

Create `features/anomalies/reasons.test.ts`:
```ts
import type { OpenAnomaly } from './api';
import { reasonByTxId } from './reasons';

describe('reasonByTxId', () => {
  it('maps transaction ids to reasons', () => {
    const open: OpenAnomaly[] = [
      { id: 'a1', transactionId: 't1', reason: 'Над обичайното', score: 3.2 },
      { id: 'a2', transactionId: 't2', reason: 'Под обичайното', score: -2.8 },
    ];
    const m = reasonByTxId(open);
    expect(m.get('t1')).toBe('Над обичайното');
    expect(m.get('t2')).toBe('Под обичайното');
    expect(m.size).toBe(2);
  });
  it('is empty for no anomalies', () => {
    expect(reasonByTxId([]).size).toBe(0);
  });
});
```
Append to `features/transactions/groupByDay.test.ts` (inside the existing `describe('toTransactionView', ...)` block, after the existing tests):
```ts
  it('populates flagReason from the reasons map for a flagged tx', () => {
    const reasons = new Map([['c', 'Над обичайното']]);
    const v = toTransactionView(tx({ id: 'c', is_flagged: true }), byId, NOW, reasons);
    expect(v.flagReason).toBe('Над обичайното');
  });

  it('leaves flagReason undefined for an unflagged tx even if a reason exists', () => {
    const reasons = new Map([['d', 'Над обичайното']]);
    const v = toTransactionView(tx({ id: 'd', is_flagged: false }), byId, NOW, reasons);
    expect(v.flagReason).toBeUndefined();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest features/anomalies/reasons.test.ts features/transactions/groupByDay.test.ts`
Expected: FAIL — `./reasons` missing; `flagReason` is undefined for the flagged-tx case.

- [ ] **Step 3: Implement**

Create `features/anomalies/reasons.ts`:
```ts
import type { OpenAnomaly } from './api';

/** Map transactionId → reason for the open anomalies (drives the row's flagReason). */
export function reasonByTxId(open: OpenAnomaly[]): Map<string, string> {
  return new Map(open.map((a) => [a.transactionId, a.reason]));
}
```
In `features/transactions/groupByDay.ts`, change `toTransactionView` to accept the reasons map and set `flagReason`:
```ts
/** Map one DB transaction to its presentational view, joining category data. */
export function toTransactionView(
  tx: Transaction,
  byId: Map<string, CategoryLite>,
  now: Date = new Date(),
  reasons: Map<string, string> = new Map(),
): TransactionView {
  const cat = tx.category_id ? byId.get(tx.category_id) : undefined;
  const name = cat?.name ?? FALLBACK_NAME;
  const time = formatTime(new Date(tx.occurred_at ?? tx.created_at));
  return {
    id: tx.id,
    merchant: tx.merchant,
    meta: `${name} • ${time}`,
    amountCents: tx.amount_eur,
    icon: (cat?.icon as MaterialIconName) ?? FALLBACK_ICON,
    iconColor: cat?.color ?? FALLBACK_COLOR,
    isFlagged: tx.is_flagged,
    flagReason: tx.is_flagged ? reasons.get(tx.id) : undefined,
  };
}
```
And thread it through `groupTransactionsByDay` — change its signature and the `toTransactionView` call:
```ts
export function groupTransactionsByDay(
  txs: Transaction[],
  categories: CategoryLite[],
  now: Date = new Date(),
  reasons: Map<string, string> = new Map(),
): TransactionDayGroup[] {
```
and inside the loop:
```ts
    group.items.push(toTransactionView(tx, byId, now, reasons));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest features/anomalies/reasons.test.ts features/transactions/groupByDay.test.ts`
Expected: PASS — reasons tests + the two new flagReason tests green; existing groupByDay tests still pass.

- [ ] **Step 5: Commit**

```bash
git add features/anomalies/reasons.ts features/anomalies/reasons.test.ts features/transactions/groupByDay.ts features/transactions/groupByDay.test.ts
git commit -m "$(cat <<'EOF'
feat(anomalies): reason map wired into transaction views

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Load open anomalies into the store

**Files:**
- Modify: `features/transactions/store.ts`
- Modify: `features/transactions/sync.ts`

**Interfaces:**
- Consumes: `OpenAnomaly`, `listOpenAnomalies` from `@/features/anomalies/api`.
- Produces: `useTransactionsStore` gains `openAnomalies: OpenAnomaly[]`; `setData(transactions, categories, openAnomalies)`; `refreshTransactions` loads anomalies.

> No new unit test: store is a Zustand container and `refreshTransactions` is a thin fetch-and-set (untested today). Gate is `tsc` + the full suite (existing `sync.test.ts` covers the realtime channel and must stay green).

- [ ] **Step 1: Update the store**

Overwrite `features/transactions/store.ts`:
```ts
import { create } from 'zustand';
import type { OpenAnomaly } from '@/features/anomalies/api';
import type { CategoryLite } from './groupByDay';
import type { Transaction } from './types';

interface TransactionsState {
  transactions: Transaction[];
  categories: CategoryLite[];
  openAnomalies: OpenAnomaly[];
  loading: boolean;
  loaded: boolean;
  setData: (
    transactions: Transaction[],
    categories: CategoryLite[],
    openAnomalies: OpenAnomaly[],
  ) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useTransactionsStore = create<TransactionsState>((set) => ({
  transactions: [],
  categories: [],
  openAnomalies: [],
  loading: true,
  loaded: false,
  setData: (transactions, categories, openAnomalies) =>
    set({ transactions, categories, openAnomalies, loading: false, loaded: true }),
  setLoading: (loading) => set({ loading }),
  reset: () =>
    set({ transactions: [], categories: [], openAnomalies: [], loading: false, loaded: false }),
}));
```

- [ ] **Step 2: Load anomalies in `refreshTransactions`**

In `features/transactions/sync.ts`, add the import and the third fetch:
```ts
import { listCategories, listTransactions } from './api';
import { listOpenAnomalies } from '@/features/anomalies/api';
```
```ts
export async function refreshTransactions(householdId: string): Promise<void> {
  const [categories, transactions, openAnomalies] = await Promise.all([
    listCategories(householdId),
    listTransactions(householdId),
    listOpenAnomalies(householdId),
  ]);
  useTransactionsStore.getState().setData(transactions, categories, openAnomalies);
}
```

- [ ] **Step 3: Typecheck + full suite**

Run: `npx tsc --noEmit && npm test`
Expected: PASS — `tsc` clean (the only `setData` caller is `refreshTransactions`, now passing 3 args); all suites green.

- [ ] **Step 4: Commit**

```bash
git add features/transactions/store.ts features/transactions/sync.ts
git commit -m "$(cat <<'EOF'
feat(anomalies): load open anomalies into the transactions store

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Run detection after a save (manual + receipt)

**Files:**
- Modify: `app/manual-entry.tsx`
- Modify: `app/confirm-receipt.tsx`

**Interfaces:**
- Consumes: `runDetection` from `@/features/anomalies/runDetection`; `useTransactionsStore`; the now-returned `{ id }` from `createTransaction` / `saveReceiptTransaction`.

> Screen task — no unit test (logic lives in the tested `runDetection`); gate is `tsc` + lint + full suite.

- [ ] **Step 1: Wire detection into manual entry**

In `app/manual-entry.tsx`, add the import (alongside the other `@/features` imports):
```ts
import { runDetection } from '@/features/anomalies/runDetection';
```
In `onSave`, replace the `try { … }` body that runs the create/update + refresh with:
```ts
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
        await refreshTransactions(householdId);
      } else {
        const { id: newId } = await createTransaction({
          householdId,
          userId: session?.user.id ?? null,
          amountCents: parsed.data.amountCents,
          merchant: parsed.data.merchant,
          categoryId: resolvedCategoryId,
          date: parsed.data.date,
          note: parsed.data.note,
        });
        await refreshTransactions(householdId);
        await runDetection({
          transactionId: newId,
          householdId,
          amountCents: parsed.data.amountCents,
          categoryId: resolvedCategoryId,
          transactions: useTransactionsStore.getState().transactions,
        });
      }
      router.back();
    } catch {
      setSaving(false);
      Alert.alert(
        'Грешка',
        isEdit ? 'Неуспешна редакция. Опитай отново.' : 'Неуспешно записване. Опитай отново.',
      );
    }
```

- [ ] **Step 2: Wire detection into the receipt confirm screen**

In `app/confirm-receipt.tsx`, add the import:
```ts
import { runDetection } from '@/features/anomalies/runDetection';
```
In `onSave`, capture the id from the save and run detection after the refresh. Replace the save + refresh + navigate tail with:
```ts
    setSaving(true);
    let newId: string;
    try {
      ({ id: newId } = await saveReceiptTransaction({
        householdId,
        userId: session?.user.id ?? null,
        storagePath,
        rawGeminiJson,
        amountCents: parsed.data.amountCents,
        merchant: parsed.data.merchant,
        categoryId: resolvedCategoryId,
        date: parsed.data.date,
        note: parsed.data.note,
      }));
    } catch {
      setSaving(false);
      Alert.alert('Грешка', 'Неуспешно записване. Опитай отново.');
      return;
    }
    try {
      await refreshTransactions(householdId);
      await runDetection({
        transactionId: newId,
        householdId,
        amountCents: parsed.data.amountCents,
        categoryId: resolvedCategoryId,
        transactions: useTransactionsStore.getState().transactions,
      });
    } catch {
      // Non-fatal: the save already succeeded; the list reconciles on next focus.
    }
    router.replace('/(app)');
```
`useTransactionsStore` is already imported in this file. Confirm `resolvedCategoryId` is the variable name used in this screen's `onSave` (it is, from the Day 11 implementation).

- [ ] **Step 3: Typecheck + lint + full suite**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: PASS — tsc clean, lint 0/0, all suites green.

- [ ] **Step 4: Commit**

```bash
git add app/manual-entry.tsx app/confirm-receipt.tsx
git commit -m "$(cat <<'EOF'
feat(anomalies): run detection after manual and receipt saves

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Surface flags + real Insights anomaly section

**Files:**
- Modify: `app/(app)/history.tsx`
- Modify: `app/(app)/index.tsx`
- Modify: `app/(app)/insights.tsx`

**Interfaces:**
- Consumes: `reasonByTxId` from `@/features/anomalies/reasons`; `markReviewed` from `@/features/anomalies/api`; `refreshTransactions`; `store.openAnomalies`.

> Screen task — no unit test; gate is `tsc` + lint + full suite.

- [ ] **Step 1: Pass reasons into the history list**

In `app/(app)/history.tsx`, add the import and build/pass the map:
```ts
import { reasonByTxId } from '@/features/anomalies/reasons';
```
```ts
  const openAnomalies = useTransactionsStore((s) => s.openAnomalies);
  const reasons = useMemo(() => reasonByTxId(openAnomalies), [openAnomalies]);

  const groups = useMemo(
    () => groupTransactionsByDay(transactions, categories, undefined, reasons),
    [transactions, categories, reasons],
  );
```

- [ ] **Step 2: Pass reasons into the dashboard "recent" rows**

In `app/(app)/index.tsx`, add the import and thread the map into `toTransactionView`:
```ts
import { reasonByTxId } from '@/features/anomalies/reasons';
```
```ts
  const openAnomalies = useTransactionsStore((s) => s.openAnomalies);
  const reasons = useMemo(() => reasonByTxId(openAnomalies), [openAnomalies]);

  const recent = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    return filtered.slice(0, 3).map((tx) => toTransactionView(tx, byId, undefined, reasons));
  }, [filtered, categories, reasons]);
```

- [ ] **Step 3: Replace the static Insights anomaly section with real data**

In `app/(app)/insights.tsx`:
1. Add imports: `Pressable` and `Alert` to the existing `react-native` import; and:
```ts
import { markReviewed } from '@/features/anomalies/api';
import { refreshTransactions } from '@/features/transactions/sync';
```
2. Delete the static `ANOMALIES` constant.
3. Add these near the other `useMemo`s (after `merchants`):
```ts
  const openAnomalies = useTransactionsStore((s) => s.openAnomalies);
  const householdId = useAuthStore((s) => s.householdId);
  const anomalyCards = useMemo(() => {
    const txById = new Map(transactions.map((t) => [t.id, t]));
    return openAnomalies
      .map((a) => {
        const t = txById.get(a.transactionId);
        return t
          ? { id: a.id, transactionId: a.transactionId, merchant: t.merchant, amountCents: t.amount_eur, reason: a.reason }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [openAnomalies, transactions]);

  const onReview = async (anomalyId: string, transactionId: string) => {
    try {
      await markReviewed(anomalyId, transactionId);
      if (householdId) await refreshTransactions(householdId);
    } catch {
      Alert.alert('Грешка', 'Неуспешно. Опитай отново.');
    }
  };
```
4. Replace the static Anomalies block (the `{/* Anomalies — STATIC placeholder (Day 13) */}` divider + `SectionLabel` + `View` mapping `ANOMALIES`) with:
```tsx
          {anomalyCards.length > 0 ? (
            <>
              <HairlineDivider className="my-xl" />
              <SectionLabel className="mb-md">Аномалии</SectionLabel>
              <View className="gap-md">
                {anomalyCards.map((a) => (
                  <View
                    key={a.id}
                    className="flex-row items-center justify-between rounded-xl border border-secondary-fixed/20 bg-secondary-fixed/5 p-md">
                    <View className="flex-1 flex-row items-center gap-md">
                      <View className="relative">
                        <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-container-high">
                          <MaterialIcons name="warning" size={20} color="#c3f400" />
                        </View>
                        <View className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-background bg-secondary-fixed" />
                      </View>
                      <View className="flex-1">
                        <Text numberOfLines={1} className="font-inter-semibold text-body-md text-on-surface">
                          {a.merchant}
                        </Text>
                        <Text numberOfLines={1} className="font-inter text-[10px] uppercase text-secondary-fixed">
                          {a.reason}
                        </Text>
                      </View>
                    </View>
                    <View className="items-end gap-1">
                      <Text className="font-inter-semibold text-data-mono text-secondary-fixed">
                        {formatCurrency(a.amountCents)}
                      </Text>
                      <Pressable onPress={() => onReview(a.id, a.transactionId)} hitSlop={6}>
                        <Text className="font-inter-semibold text-label-md text-primary">Прегледай</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : null}
```

- [ ] **Step 4: Typecheck + lint + full suite**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: PASS — tsc clean, lint 0/0 (remove any now-unused import lint flags), all suites green.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/history.tsx" "app/(app)/index.tsx" "app/(app)/insights.tsx"
git commit -m "$(cat <<'EOF'
feat(anomalies): show flag reasons and a real Insights anomaly section

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Build-plan update

**Files:**
- Modify: `teftera-build-plan.md`

> No code. Records Day 13 completion.

- [ ] **Step 1: Check off Day 13 and add a note**

In `teftera-build-plan.md`, under `### Day 13 — Anomaly Detection`, change each `- [ ]` to `- [x]`, and append a note. Replace the seven checklist lines with:
```markdown
- [x] `/services/anomaly.ts`: Z-score function over transaction history per category *(pre-existing, reused)*
- [x] Runs after every new transaction is saved *(automatic on manual + receipt saves; no manual trigger)*
- [x] Threshold: |Z| > 2.5 → flag the transaction, create `anomalies` row
- [x] Flagged transactions render with `secondary-fixed` (`#c3f400`) accent in history list: dot on icon, lime amount text, reason label
- [x] Anomaly section on Insights screen shows flagged transactions with "Review" action
- [x] Mark-as-reviewed action clears the flag
- [x] Unit tests: Z-score function, threshold edge cases

> Implemented + reviewed on branch `feat/day13-anomaly-detection` (plan `docs/superpowers/plans/2026-06-28-day13-anomaly-detection.md`). Detection runs automatically after manual + receipt saves (best-effort, never blocks the save), household-scoped, amount-only. New `features/anomalies/` slice (`detect`, `api`, `runDetection`, `reasons`) wraps the pre-existing tested Z-score engine; `createTransaction` now returns the new id; the store loads open anomalies so reasons render in history and sync via the existing realtime refetch. **Out of scope (v1):** edit re-scoring, DSK-import scoring, high-frequency detector, review-from-detail-screen.
```

- [ ] **Step 2: Commit**

```bash
git add teftera-build-plan.md
git commit -m "$(cat <<'EOF'
docs(day13): mark anomaly detection complete

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** automatic on-save detection (T6) · household-scoped amount-only history (T2) · |Z|>2.5 flag + anomalies row (T3) · best-effort never-throws (T3) · createTransaction returns id (T1) · open anomalies in store (T5) · flagReason in history rows (T4/T7) · real Insights anomaly section + Review/markReviewed clears flag (T3/T7) · detect-on-create-only, no import/edit scoring (T6 only wires the create paths). All spec sections map to a task.
- **Type consistency:** `OpenAnomaly`/`NewAnomaly` (T3) consumed in T4/T5/T7; `RunDetectionInput`/deps (T3) consumed in T6; `historyForCategory`/`evaluate` (T2) consumed in T3; `reasonByTxId` (T4) consumed in T7; `createTransaction(): {id}` (T1) consumed in T6; `toTransactionView(..., reasons)` (T4) consumed in T7. `runDetection` reads `useTransactionsStore.getState().transactions` via the caller passing `transactions`, after `refreshTransactions` (so the new row is present and excluded by id).
- **No placeholders:** every code step has complete code; the only conditional ("remove any now-unused import lint flags") is a concrete lint-driven action after deleting the `ANOMALIES` constant.

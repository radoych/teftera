# Day 11 — Gemini Receipt Extraction + Confirm Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the static confirm-receipt screen into a live flow where a captured receipt is read by Gemini, pre-fills an editable form, and Save creates a linked `receipts` + `transactions` pair — degrading gracefully to an empty manual form on extraction failure.

**Architecture:** Extraction runs on the confirm screen on mount (reading local base64 from `previewUri`), reusing the existing `extractReceipt(base64)` chokepoint untouched. Pure helpers (note building, sum reconciliation, extraction→form mapping) live in `features/receipts/extraction.ts` and are unit-tested. A thin `features/receipts/api.ts` owns the `receipts` insert; `features/receipts/save.ts` orchestrates "receipt first → transaction with `receipt_id`" via injected dependencies for testability. The screen wires it all together with reused `DateField` / `CategoryPickerModal`.

**Tech Stack:** React Native + Expo, TypeScript strict, Supabase JS, `@google/generative-ai`, `expo-file-system` (new `File` API), Jest (`jest-expo`), Zod.

## Global Constraints

- **Money = integers (euro-cents).** Never float arithmetic; all display via `formatCurrency`. (CLAUDE.md)
- **EUR (€) only** for live scans; no `$`/USD. `original_amount`/`original_currency` stay null for receipt transactions (2026 EUR era). (CLAUDE.md)
- **Gemini always has a fallback.** All JSON parsing in try/catch; bad/empty response → manual-edit form, never crash, never block. (CLAUDE.md rule 6) — already satisfied by `extractReceipt`.
- **All Gemini calls live in `/services/gemini.ts`.** Do not add LLM calls elsewhere. (CLAUDE.md rule 5)
- **TypeScript strict; no `any`; no plain `.js`.**
- **`household_id` on every written row.** RLS scopes reads/writes by household.
- **Conventional commits**; commit messages end with the `Co-Authored-By` trailer below.
- **UI copy is Bulgarian** (matches existing screens).
- Verification commands: `npm test` (jest), `npx tsc --noEmit` (typecheck), `npm run lint`.

Commit trailer for every commit in this plan:
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## File Structure

- `lib/formatCurrency.ts` — **modify**: add `centsToInput(cents): string` (inverse of `parseAmountToCents`).
- `features/transactions/edit.ts` — **modify**: `transactionToFormValues` uses `centsToInput` (DRY refactor).
- `features/receipts/extraction.ts` — **create**: pure helpers `itemsToNote`, `itemsSumCents`, `extractionToForm` + `ReceiptFormItem` / `ReceiptFormSeed` types.
- `features/receipts/extraction.test.ts` — **create**: unit tests for the above.
- `features/receipts/api.ts` — **create**: `insertReceipt(...)` — the only writer of the `receipts` table.
- `features/transactions/api.ts` — **modify**: add optional `receiptId` to `NewTransaction`; `createTransaction` sets `receipt_id`.
- `features/receipts/save.ts` — **create**: `saveReceiptTransaction(input, deps)` orchestration (receipt → transaction).
- `features/receipts/save.test.ts` — **create**: orchestration order + linkage test (injected fakes).
- `app/confirm-receipt.tsx` — **modify**: full rework — extraction on mount, editable date/category, reconciliation hint, Save wiring.

---

## Task 1: `centsToInput` shared money helper

**Files:**
- Modify: `lib/formatCurrency.ts`
- Modify: `features/transactions/edit.ts`
- Test: `lib/formatCurrency.test.ts` (exists — append)

**Interfaces:**
- Consumes: nothing new.
- Produces: `centsToInput(cents: number): string` — integer cents → bare bg-BG decimal string with comma, no symbol, 2 decimals (e.g. `1250 → "12,50"`, `0 → "0,00"`, `-500 → "-5,00"`). Non-finite → `"0,00"`.

- [ ] **Step 1: Write the failing test**

Append to `lib/formatCurrency.test.ts`:
```ts
import { centsToInput } from './formatCurrency';

describe('centsToInput', () => {
  it('formats integer cents as a comma-decimal string without a symbol', () => {
    expect(centsToInput(1250)).toBe('12,50');
  });
  it('keeps two decimals for round amounts', () => {
    expect(centsToInput(500)).toBe('5,00');
  });
  it('formats zero', () => {
    expect(centsToInput(0)).toBe('0,00');
  });
  it('keeps the sign for negatives', () => {
    expect(centsToInput(-500)).toBe('-5,00');
  });
  it('falls back to 0,00 for non-finite input', () => {
    expect(centsToInput(NaN)).toBe('0,00');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/formatCurrency.test.ts -t centsToInput`
Expected: FAIL — `centsToInput is not a function` / no export.

- [ ] **Step 3: Implement `centsToInput`**

Add to `lib/formatCurrency.ts` (after `parseAmountToCents`):
```ts
/**
 * Format integer minor units as a bare decimal input string (comma decimal,
 * no currency symbol, no grouping) — the inverse of `parseAmountToCents`.
 * Intended for seeding editable amount `TextInput`s. Non-finite → "0,00".
 */
export function centsToInput(cents: number): string {
  if (!Number.isFinite(cents)) return '0,00';
  return (cents / 100).toFixed(2).replace('.', ',');
}
```

- [ ] **Step 4: DRY — reuse it in `transactionToFormValues`**

In `features/transactions/edit.ts`, add the import and replace the inline amount formatting:
```ts
import { centsToInput } from '@/lib/formatCurrency';
import type { Transaction } from './types';
```
Change the `amount` field inside `transactionToFormValues`:
```ts
    amount: centsToInput(tx.amount_eur),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest lib/formatCurrency.test.ts features/transactions/edit.test.ts`
Expected: PASS (both files green — the edit refactor keeps `transactionToFormValues` output identical).

- [ ] **Step 6: Commit**

```bash
git add lib/formatCurrency.ts lib/formatCurrency.test.ts features/transactions/edit.ts
git commit -m "$(cat <<'EOF'
refactor(money): extract shared centsToInput helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Receipt extraction pure helpers

**Files:**
- Create: `features/receipts/extraction.ts`
- Test: `features/receipts/extraction.test.ts`

**Interfaces:**
- Consumes: `ReceiptExtraction`, `ReceiptLineItem` from `@/services/gemini`; `centsToInput`, `parseAmountToCents` from `@/lib/formatCurrency`; `toISODate` from `@/lib/dates`.
- Produces:
  - `interface ReceiptFormItem { id: string; description: string; amount: string }`
  - `interface ReceiptFormSeed { merchant: string; total: string; date: string; items: ReceiptFormItem[] }`
  - `itemsToNote(items: { description: string }[]): string` — trims, drops empty descriptions, joins with `, `.
  - `itemsSumCents(items: { amount: string }[]): number` — sums `parseAmountToCents(amount)` (null → 0).
  - `extractionToForm(extraction: ReceiptExtraction): ReceiptFormSeed` — maps extraction → seed; `total` is `centsToInput(totalCents)` when `totalCents > 0` else `''`; `date` is `extraction.date ?? toISODate()`; each item gets a stable id (`String(index)`).

- [ ] **Step 1: Write the failing test**

Create `features/receipts/extraction.test.ts`:
```ts
import type { ReceiptExtraction } from '@/services/gemini';
import { itemsToNote, itemsSumCents, extractionToForm } from './extraction';

describe('itemsToNote', () => {
  it('joins non-empty descriptions with a comma', () => {
    expect(
      itemsToNote([
        { description: 'Кафе еспресо' },
        { description: 'лимонада бъз' },
        { description: 'донът' },
      ]),
    ).toBe('Кафе еспресо, лимонада бъз, донът');
  });
  it('trims and drops empty descriptions', () => {
    expect(itemsToNote([{ description: ' Кафе ' }, { description: '  ' }, { description: '' }])).toBe(
      'Кафе',
    );
  });
  it('returns an empty string when there are no items', () => {
    expect(itemsToNote([])).toBe('');
  });
});

describe('itemsSumCents', () => {
  it('sums parsed comma-decimal amounts', () => {
    expect(itemsSumCents([{ amount: '5,40' }, { amount: '3,80' }])).toBe(920);
  });
  it('treats unparseable amounts as zero', () => {
    expect(itemsSumCents([{ amount: '' }, { amount: 'abc' }, { amount: '2,00' }])).toBe(200);
  });
});

describe('extractionToForm', () => {
  const base: ReceiptExtraction = {
    merchant: 'Kaufland',
    date: '2026-06-20',
    totalCents: 1420,
    currency: 'EUR',
    items: [
      { description: 'Кафе', amountCents: 540 },
      { description: 'Мъфин', amountCents: 380 },
    ],
  };

  it('maps merchant, total string, date, and items with stable ids', () => {
    const seed = extractionToForm(base);
    expect(seed.merchant).toBe('Kaufland');
    expect(seed.total).toBe('14,20');
    expect(seed.date).toBe('2026-06-20');
    expect(seed.items).toEqual([
      { id: '0', description: 'Кафе', amount: '5,40' },
      { id: '1', description: 'Мъфин', amount: '3,80' },
    ]);
  });

  it('uses an empty total when none was detected', () => {
    expect(extractionToForm({ ...base, totalCents: 0 }).total).toBe('');
  });

  it("falls back to today's date when extraction has none", () => {
    expect(extractionToForm({ ...base, date: null }).date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest features/receipts/extraction.test.ts`
Expected: FAIL — cannot find module `./extraction`.

- [ ] **Step 3: Implement the helpers**

Create `features/receipts/extraction.ts`:
```ts
import type { ReceiptExtraction } from '@/services/gemini';
import { centsToInput, parseAmountToCents } from '@/lib/formatCurrency';
import { toISODate } from '@/lib/dates';

/** Editable line item as held in the confirm-receipt screen state. */
export interface ReceiptFormItem {
  id: string;
  description: string;
  amount: string; // comma-decimal major units, e.g. "5,40"
}

/** Seed values for the confirm-receipt form, derived from a Gemini extraction. */
export interface ReceiptFormSeed {
  merchant: string;
  total: string; // comma-decimal major units, '' when not detected
  date: string; // YYYY-MM-DD
  items: ReceiptFormItem[];
}

/** Comma-join non-empty (trimmed) item descriptions for the transaction note. */
export function itemsToNote(items: { description: string }[]): string {
  return items
    .map((i) => i.description.trim())
    .filter((d) => d.length > 0)
    .join(', ');
}

/** Sum the item amount inputs in integer cents (unparseable → 0). */
export function itemsSumCents(items: { amount: string }[]): number {
  return items.reduce((sum, i) => sum + (parseAmountToCents(i.amount) ?? 0), 0);
}

/** Map a Gemini extraction to editable form seed values. */
export function extractionToForm(extraction: ReceiptExtraction): ReceiptFormSeed {
  return {
    merchant: extraction.merchant,
    total: extraction.totalCents > 0 ? centsToInput(extraction.totalCents) : '',
    date: extraction.date ?? toISODate(),
    items: extraction.items.map((it, index) => ({
      id: String(index),
      description: it.description,
      amount: centsToInput(it.amountCents),
    })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest features/receipts/extraction.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add features/receipts/extraction.ts features/receipts/extraction.test.ts
git commit -m "$(cat <<'EOF'
feat(receipts): pure helpers for note, sum, and extraction-to-form

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `receipts` insert API

**Files:**
- Create: `features/receipts/api.ts`

**Interfaces:**
- Consumes: `supabase` from `@/services/supabase`.
- Produces:
  - `interface NewReceipt { householdId: string; userId: string | null; storagePath: string; rawGeminiJson: unknown }`
  - `insertReceipt(input: NewReceipt): Promise<{ id: string }>` — inserts one `receipts` row with `processed_at = new Date().toISOString()`, returns the new id. Throws on error.

> No unit test for this task: it is a thin Supabase writer with no branching logic (mirrors `features/receipts/storage.ts`, which is also untested). Its contract is exercised through Task 5's orchestration test via an injected fake. The `tsc`/lint check in Step 2 is the gate.

- [ ] **Step 1: Implement `insertReceipt`**

Create `features/receipts/api.ts`:
```ts
// features/receipts/api.ts — the ONLY module that writes the `receipts` table.
import { supabase } from '@/services/supabase';

export interface NewReceipt {
  householdId: string;
  userId: string | null;
  storagePath: string;
  rawGeminiJson: unknown;
}

/**
 * Insert one receipt row and return its id. `processed_at` is stamped now.
 * RLS scopes the row to the household. Throws on failure.
 */
export async function insertReceipt(input: NewReceipt): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('receipts')
    .insert({
      household_id: input.householdId,
      user_id: input.userId,
      storage_path: input.storagePath,
      raw_gemini_json: input.rawGeminiJson,
      processed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: (data as { id: string }).id };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors).

- [ ] **Step 3: Commit**

```bash
git add features/receipts/api.ts
git commit -m "$(cat <<'EOF'
feat(receipts): insertReceipt writer for the receipts table

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Link `receipt_id` in `createTransaction`

**Files:**
- Modify: `features/transactions/api.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `NewTransaction` gains `receiptId?: string | null`; `createTransaction` writes `receipt_id` and tags `source: 'receipt'` when a `receiptId` is present, else keeps `source: 'manual'` and `receipt_id: null`.

> No new unit test: `createTransaction` is a thin writer (existing code is untested). The linkage is asserted in Task 5's orchestration test. `tsc` is the gate here.

- [ ] **Step 1: Extend `NewTransaction`**

In `features/transactions/api.ts`, add the field to the interface:
```ts
export interface NewTransaction {
  householdId: string;
  userId: string | null;
  amountCents: number;
  merchant: string;
  categoryId: string | null;
  date: string; // YYYY-MM-DD
  note: string | null;
  receiptId?: string | null;
}
```

- [ ] **Step 2: Set `receipt_id` and `source` in `createTransaction`**

Replace the insert body of `createTransaction`:
```ts
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
    receipt_id: input.receiptId ?? null,
    source: input.receiptId ? 'receipt' : 'manual',
  });
  if (error) throw error;
}
```

- [ ] **Step 3: Typecheck + existing tests**

Run: `npx tsc --noEmit && npx jest features/transactions`
Expected: PASS (no callers break — `receiptId` is optional; manual entry omits it and keeps `source: 'manual'`).

- [ ] **Step 4: Commit**

```bash
git add features/transactions/api.ts
git commit -m "$(cat <<'EOF'
feat(transactions): link receipt_id and receipt source on createTransaction

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Save orchestration (receipt → linked transaction)

**Files:**
- Create: `features/receipts/save.ts`
- Test: `features/receipts/save.test.ts`

**Interfaces:**
- Consumes: `insertReceipt`, `NewReceipt` from `./api`; `createTransaction`, `NewTransaction` from `@/features/transactions/api`.
- Produces:
  - `interface SaveReceiptInput { householdId: string; userId: string | null; storagePath: string; rawGeminiJson: unknown; amountCents: number; merchant: string; categoryId: string | null; date: string; note: string | null }`
  - `interface SaveReceiptDeps { insertReceipt: typeof insertReceipt; createTransaction: typeof createTransaction }`
  - `saveReceiptTransaction(input: SaveReceiptInput, deps?: SaveReceiptDeps): Promise<void>` — inserts the receipt first, then the transaction carrying the returned `receiptId`. Deps default to the real implementations; tests inject fakes.

- [ ] **Step 1: Write the failing test**

Create `features/receipts/save.test.ts`:
```ts
import { saveReceiptTransaction, type SaveReceiptInput } from './save';

const input: SaveReceiptInput = {
  householdId: 'H',
  userId: 'U',
  storagePath: 'H/abc.jpg',
  rawGeminiJson: { merchant: 'Kaufland' },
  amountCents: 1420,
  merchant: 'Kaufland',
  categoryId: 'cat-groceries',
  date: '2026-06-20',
  note: 'Кафе, Мъфин',
};

describe('saveReceiptTransaction', () => {
  it('inserts the receipt first, then the transaction linked by receipt_id', async () => {
    const calls: string[] = [];
    const insertReceipt = jest.fn(async () => {
      calls.push('receipt');
      return { id: 'receipt-1' };
    });
    const createTransaction = jest.fn(async () => {
      calls.push('transaction');
    });

    await saveReceiptTransaction(input, { insertReceipt, createTransaction });

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

  it('does not create a transaction when the receipt insert fails', async () => {
    const insertReceipt = jest.fn(async () => {
      throw new Error('insert failed');
    });
    const createTransaction = jest.fn(async () => {});

    await expect(
      saveReceiptTransaction(input, { insertReceipt, createTransaction }),
    ).rejects.toThrow('insert failed');
    expect(createTransaction).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest features/receipts/save.test.ts`
Expected: FAIL — cannot find module `./save`.

- [ ] **Step 3: Implement the orchestration**

Create `features/receipts/save.ts`:
```ts
import { createTransaction, type NewTransaction } from '@/features/transactions/api';
import { insertReceipt, type NewReceipt } from './api';

export interface SaveReceiptInput {
  householdId: string;
  userId: string | null;
  storagePath: string;
  rawGeminiJson: unknown;
  amountCents: number;
  merchant: string;
  categoryId: string | null;
  date: string; // YYYY-MM-DD
  note: string | null;
}

export interface SaveReceiptDeps {
  insertReceipt: typeof insertReceipt;
  createTransaction: typeof createTransaction;
}

const defaultDeps: SaveReceiptDeps = { insertReceipt, createTransaction };

/**
 * Persist a scanned receipt: insert the `receipts` row first (for its id),
 * then the linked `transactions` row. Sequential — a transaction failure
 * leaves an orphan receipt row, which is accepted (no RPC wrapper).
 */
export async function saveReceiptTransaction(
  input: SaveReceiptInput,
  deps: SaveReceiptDeps = defaultDeps,
): Promise<void> {
  const receipt: NewReceipt = {
    householdId: input.householdId,
    userId: input.userId,
    storagePath: input.storagePath,
    rawGeminiJson: input.rawGeminiJson,
  };
  const { id } = await deps.insertReceipt(receipt);

  const transaction: NewTransaction = {
    householdId: input.householdId,
    userId: input.userId,
    amountCents: input.amountCents,
    merchant: input.merchant,
    categoryId: input.categoryId,
    date: input.date,
    note: input.note,
    receiptId: id,
  };
  await deps.createTransaction(transaction);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest features/receipts/save.test.ts`
Expected: PASS (both cases green).

- [ ] **Step 5: Commit**

```bash
git add features/receipts/save.ts features/receipts/save.test.ts
git commit -m "$(cat <<'EOF'
feat(receipts): saveReceiptTransaction orchestration

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Wire the confirm-receipt screen

**Files:**
- Modify: `app/confirm-receipt.tsx`

**Interfaces:**
- Consumes: `extractReceipt` from `@/services/gemini`; `extractionToForm`, `itemsToNote`, `itemsSumCents`, `ReceiptFormItem` from `@/features/receipts/extraction`; `saveReceiptTransaction` from `@/features/receipts/save`; `parseManualEntry` from `@/features/transactions/schema`; `resolveCategoryId` from `@/lib/categories`; `centsToInput` from `@/lib/formatCurrency`; `formatCurrency` from `@/lib/formatCurrency`; `toISODate` from `@/lib/dates`; `refreshTransactions` from `@/features/transactions/sync`; `useAuthStore`, `useTransactionsStore`; reused `DateField`, `CategoryPickerModal`; `File` from `expo-file-system`.
- Produces: the live confirm screen. No new exports.

> This is a screen (UI) task — verified by typecheck, lint, and on-device run, consistent with the project's other screens (no RN render unit tests). All pure logic it relies on is already tested in Tasks 1–5.

- [ ] **Step 1: Replace the screen implementation**

Overwrite `app/confirm-receipt.tsx` with:
```tsx
import { MaterialIcons } from '@expo/vector-icons';
import { File } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackgroundGlow } from '@/components/BackgroundGlow';
import { HairlineDivider } from '@/components/HairlineDivider';
import { PillButton } from '@/components/PillButton';
import { SectionLabel } from '@/components/SectionLabel';
import { useAuthStore } from '@/features/auth/store';
import {
  extractionToForm,
  itemsSumCents,
  itemsToNote,
  type ReceiptFormItem,
} from '@/features/receipts/extraction';
import { saveReceiptTransaction } from '@/features/receipts/save';
import { CategoryPickerModal } from '@/features/transactions/components/CategoryPickerModal';
import { DateField } from '@/features/transactions/components/DateField';
import { parseManualEntry } from '@/features/transactions/schema';
import { useTransactionsStore } from '@/features/transactions/store';
import { refreshTransactions } from '@/features/transactions/sync';
import { resolveCategoryId } from '@/lib/categories';
import { toISODate } from '@/lib/dates';
import { extractReceipt } from '@/services/gemini';
import { centsToInput, formatCurrency, parseAmountToCents } from '@/lib/formatCurrency';

type Phase = 'extracting' | 'ready';

export default function ConfirmReceiptScreen() {
  const { storagePath, previewUri } = useLocalSearchParams<{
    storagePath?: string;
    previewUri?: string;
  }>();
  const categories = useTransactionsStore((s) => s.categories);

  const [phase, setPhase] = useState<Phase>('extracting');
  const [merchant, setMerchant] = useState('');
  const [total, setTotal] = useState('');
  const [date, setDate] = useState(toISODate());
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [items, setItems] = useState<ReceiptFormItem[]>([]);
  const [rawGeminiJson, setRawGeminiJson] = useState<unknown>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [errors, setErrors] = useState<{ amount?: string; merchant?: string }>({});
  const [saving, setSaving] = useState(false);
  const started = useRef(false);

  const runExtraction = useCallback(async () => {
    if (!previewUri) {
      setPhase('ready');
      return;
    }
    try {
      const base64 = await new File(previewUri).base64();
      const result = await extractReceipt(base64);
      if (result.ok) {
        const seed = extractionToForm(result.data);
        setMerchant(seed.merchant);
        setTotal(seed.total);
        setDate(seed.date);
        setItems(seed.items);
        setRawGeminiJson(result.raw);
      }
    } catch (err) {
      if (__DEV__) console.warn('[confirm-receipt] extraction failed', err);
    } finally {
      setPhase('ready');
    }
  }, [previewUri]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    runExtraction();
  }, [runExtraction]);

  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));
  const addItem = () =>
    setItems((prev) => [...prev, { id: String(Date.now()), description: '', amount: '' }]);

  // Reconciliation: soft hint only, never blocks save.
  const totalCents = parseAmountToCents(total);
  const sumCents = itemsSumCents(items);
  const showMismatch =
    items.length > 0 && totalCents !== null && totalCents > 0 && sumCents !== totalCents;

  const selectedCategory = categoryId ? categories.find((c) => c.id === categoryId) : undefined;
  const categoryLabel = selectedCategory
    ? selectedCategory.name
    : 'Автоматично';

  const onSave = async () => {
    if (saving) return;
    const note = itemsToNote(items);
    const parsed = parseManualEntry({ amount: total, merchant, note, date });
    if (!parsed.success) {
      setErrors({ amount: parsed.errors.amount, merchant: parsed.errors.merchant });
      return;
    }
    setErrors({});

    const { householdId, session } = useAuthStore.getState();
    if (!householdId || !storagePath) {
      Alert.alert('Грешка', 'Липсва домакинство или бележка.');
      return;
    }
    const resolvedCategoryId = categoryTouched
      ? categoryId
      : resolveCategoryId(parsed.data.merchant, categories);

    setSaving(true);
    try {
      await saveReceiptTransaction({
        householdId,
        userId: session?.user.id ?? null,
        storagePath,
        rawGeminiJson,
        amountCents: parsed.data.amountCents,
        merchant: parsed.data.merchant,
        categoryId: resolvedCategoryId,
        date: parsed.data.date,
        note: parsed.data.note,
      });
      await refreshTransactions(householdId);
      router.replace('/(app)');
    } catch {
      setSaving(false);
      Alert.alert('Грешка', 'Неуспешно записване. Опитай отново.');
    }
  };

  return (
    <View className="flex-1 bg-background">
      <BackgroundGlow />
      <SafeAreaView className="flex-1" edges={['top']}>
        {/* Top bar */}
        <View className="flex-row items-center justify-between px-8 py-4">
          <View className="w-6" />
          <Text className="font-jakarta-medium text-headline-md text-on-surface">
            Потвърди бележката
          </Text>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <MaterialIcons name="close" size={24} color="#e3e2e6" />
          </Pressable>
        </View>

        <ScrollView
          className="px-8"
          contentContainerClassName="pb-40"
          keyboardShouldPersistTaps="handled">
          {/* Thumbnail */}
          <View className="my-xl items-center">
            {previewUri ? (
              <Image
                source={{ uri: previewUri }}
                className="h-28 w-20 rounded-xl"
                resizeMode="cover"
              />
            ) : (
              <View className="h-28 w-20 items-center justify-center rounded-xl bg-surface-container-high">
                <MaterialIcons name="receipt-long" size={28} color="rgba(255,255,255,0.4)" />
              </View>
            )}
          </View>

          {phase === 'extracting' ? (
            <View className="items-center gap-md py-xl">
              <ActivityIndicator size="large" color="#adc7ff" />
              <Text className="font-inter text-body-lg text-on-surface-variant">
                Разчитане на бележката…
              </Text>
            </View>
          ) : (
            <>
              {/* Merchant */}
              <View className="mb-xl">
                <SectionLabel className="mb-1">Търговец</SectionLabel>
                <TextInput
                  value={merchant}
                  onChangeText={setMerchant}
                  placeholder="Въведи търговец"
                  placeholderTextColor="rgba(142,144,154,0.5)"
                  className="font-jakarta-semibold text-headline-lg-mobile text-on-surface"
                />
                {errors.merchant ? (
                  <Text className="mt-1 font-inter text-body-md text-error">{errors.merchant}</Text>
                ) : null}
                <HairlineDivider className="mt-xs" />
              </View>

              {/* Total */}
              <View className="mb-xl">
                <SectionLabel className="mb-1">Общо</SectionLabel>
                <View className="flex-row items-baseline">
                  <Text className="mr-1 font-jakarta-semibold text-headline-xl text-primary-container">
                    €
                  </Text>
                  <TextInput
                    value={total}
                    onChangeText={setTotal}
                    placeholder="0,00"
                    placeholderTextColor="rgba(142,144,154,0.5)"
                    keyboardType="decimal-pad"
                    className="flex-1 font-jakarta-semibold text-headline-xl text-on-surface"
                  />
                </View>
                {errors.amount ? (
                  <Text className="mt-1 font-inter text-body-md text-error">{errors.amount}</Text>
                ) : null}
                {showMismatch ? (
                  <Text className="mt-1 font-inter text-body-md text-on-surface-variant opacity-70">
                    {`Артикулите сборуват ${formatCurrency(sumCents)} — общо ${formatCurrency(
                      totalCents ?? 0,
                    )}`}
                  </Text>
                ) : null}
                <HairlineDivider className="mt-xs" />
              </View>

              {/* Date + Category */}
              <DateField value={date} onChange={setDate} />
              <Pressable
                onPress={() => setPickerOpen(true)}
                className="active:bg-white/5">
                <View className="flex-row items-center justify-between py-5">
                  <View className="flex-1 gap-1">
                    <Text className="font-inter-medium text-label-md uppercase text-on-surface-variant opacity-60">
                      Категория
                    </Text>
                    <Text className="font-inter text-body-lg text-on-surface">{categoryLabel}</Text>
                  </View>
                  <MaterialIcons name="expand-more" size={22} color="#c4c6d0" />
                </View>
              </Pressable>
              <HairlineDivider className="mb-xl" />

              {/* Items */}
              <SectionLabel className="mb-md">Артикули</SectionLabel>
              {items.map((item) => (
                <View key={item.id}>
                  <View className="flex-row items-center justify-between py-md">
                    <TextInput
                      value={item.description}
                      onChangeText={(t) =>
                        setItems((prev) =>
                          prev.map((i) => (i.id === item.id ? { ...i, description: t } : i)),
                        )
                      }
                      placeholder="Артикул"
                      placeholderTextColor="rgba(142,144,154,0.5)"
                      className="flex-1 font-inter text-body-lg text-on-surface"
                    />
                    <View className="flex-row items-center gap-md">
                      <View className="flex-row items-center">
                        <Text className="mr-1 font-inter text-label-md text-on-surface-variant">€</Text>
                        <TextInput
                          value={item.amount}
                          onChangeText={(t) =>
                            setItems((prev) =>
                              prev.map((i) => (i.id === item.id ? { ...i, amount: t } : i)),
                            )
                          }
                          keyboardType="decimal-pad"
                          className="w-16 text-right font-inter-semibold text-data-mono text-on-surface"
                        />
                      </View>
                      <Pressable onPress={() => removeItem(item.id)} hitSlop={8}>
                        <MaterialIcons name="delete" size={18} color="#ffb4ab" />
                      </Pressable>
                    </View>
                  </View>
                  <HairlineDivider />
                </View>
              ))}

              <Pressable onPress={addItem} className="flex-row items-center py-md active:opacity-70">
                <MaterialIcons name="add" size={20} color="#adc7ff" />
                <Text className="ml-md font-inter text-body-md text-on-surface-variant">
                  Добави артикул
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>

        {/* Bottom actions */}
        <View className="absolute inset-x-0 bottom-0 flex-row gap-md bg-background px-8 pb-8 pt-md">
          <View className="flex-1">
            <PillButton
              label="Отново"
              variant="ghost"
              uppercase
              block
              onPress={() => router.replace('/scanner')}
            />
          </View>
          <View className="flex-1">
            <PillButton
              label="Запази"
              variant="filled"
              uppercase
              block
              loading={saving}
              onPress={onSave}
            />
          </View>
        </View>
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

> **Note on `PillButton`:** `components/PillButton.tsx` already supports `loading`, `variant`, `uppercase`, `block`, and `onPress` (verified). The `loading={saving}` prop shows a spinner and disables the button while saving.

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS — no type or lint errors.

- [ ] **Step 3: Full test run**

Run: `npm test`
Expected: PASS — all suites green (no screen tests added; pure helpers from Tasks 1–5 stay green).

- [ ] **Step 4: Commit**

```bash
git add app/confirm-receipt.tsx
git commit -m "$(cat <<'EOF'
feat(receipts): wire confirm screen to Gemini extraction and save

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Manual device verification + build-plan update

**Files:**
- Modify: `teftera-build-plan.md` (check off Day 11 items, add an implementation note)

> No code. This task records the human on-device checkpoint and updates the plan, consistent with how Days 5–9 were closed out.

- [ ] **Step 1: On-device smoke test (human/dev-client)**

In a dev-client build (`expo-camera`/document scanner need native code): open Scanner → capture a real receipt (e.g. Kaufland) → confirm screen shows "Разчитане на бележката…" then pre-fills merchant + total. Verify:
  - Fields are editable; date opens the wheel picker; category opens the bottom sheet and auto-guesses from merchant.
  - A receipt whose items don't sum to the total shows the soft mismatch hint and still saves.
  - Save returns to the dashboard and the new transaction appears (with the item-descriptions note) in History; the linked receipt thumbnail shows on the transaction detail.
  - Disable the Gemini key (or scan an unreadable image) → confirm screen opens with empty fields, no crash, manual fill + save works.

- [ ] **Step 2: Update the build plan**

In `teftera-build-plan.md`, check off the Day 11 checklist items (`- [ ]` → `- [x]`) and append an implementation note under Day 11, e.g.:
```markdown
> Implemented + reviewed on branch `feat/day11-gemini-receipt-extraction`. Extraction
> runs on the confirm screen from the local captured image (base64, no signed URL).
> Line items are flattened into the transaction note (descriptions only); the total is
> authoritative with a soft, non-blocking reconciliation hint. Save inserts a `receipts`
> row then a linked `transactions` row (`source: 'receipt'`).
```

- [ ] **Step 3: Commit**

```bash
git add teftera-build-plan.md
git commit -m "$(cat <<'EOF'
docs(day11): mark Gemini receipt extraction complete

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** extraction on confirm screen (T6) · local base64 (T6) · reuse `extractReceipt` unchanged (no task touches `gemini.ts`) · editable date/category (T6) · merchant auto-guess (T6) · items editable + flattened to note descriptions-only (T2/T6) · soft reconciliation hint never blocks (T2/T6) · `receipts` row + linked transaction, `source: 'receipt'` (T3/T4/T5) · EUR-native, raw JSON stored (T3/T5) · failure → empty manual form (T6) · shared `centsToInput` extraction (T1). All spec sections map to a task.
- **Type consistency:** `ReceiptFormItem`/`ReceiptFormSeed` defined in T2 and consumed in T6; `NewReceipt` (T3) consumed in T5; `NewTransaction.receiptId` (T4) consumed in T5; `SaveReceiptInput` (T5) consumed in T6. `centsToInput` (T1) used in T2 and T6. `extractReceipt`/`ReceiptExtraction` consumed as already defined in `services/gemini.ts`.
- **Open verification:** `PillButton.loading` confirmed present in `components/PillButton.tsx` — no open assumptions remain.
```

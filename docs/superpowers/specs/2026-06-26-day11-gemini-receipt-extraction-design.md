# Day 11 — Gemini Receipt Extraction + Confirm Screen

**Date:** 2026-06-26
**Status:** Approved design, ready for implementation plan
**Build plan:** Day 11 (Phase 4 — Import & Receipt Scanning)

---

## Goal

Turn the static confirm-receipt screen into a live flow: a captured receipt is read
by Gemini, the extracted fields pre-fill an editable form, and Save creates a linked
`receipts` + `transactions` pair. Extraction failures degrade gracefully to an empty
manual-entry form — never a crash, never a blocking error state.

## Context — what already exists

- `services/gemini.ts` → `extractReceipt(base64Image, mimeType='image/jpeg')` already
  implements: try/catch fallback returning `{ ok: false }`, dev-mode raw-response
  logging, decimal→cents normalization, and EUR/BGN currency detection. **Reused as-is —
  no change to this file.**
- `app/scanner.tsx` (Day 10) captures → compresses → uploads to the `receipts` bucket →
  `router.replace('/confirm-receipt', { storagePath, previewUri })`. The `previewUri` is
  the local compressed JPEG and is available for the duration of the flow.
- `features/receipts/storage.ts` → `uploadReceipt(localUri, householdId)` returns
  `{ storagePath }`.
- `features/transactions/api.ts` → `createTransaction(NewTransaction)`. Does **not**
  currently set `receipt_id`.
- DB: `receipts` table (`id, household_id, user_id, storage_path, raw_gemini_json,
  processed_at, created_at`) and `transactions.receipt_id` column already exist.
- `transactions.note` is Postgres `text` — no practical length limit.
- Reusable UI already built: `DateField`, `CategoryPickerModal` (manual-entry),
  `guessCategory` / `resolveCategoryId` (`lib/categories.ts`), `parseManualEntry`
  (`features/transactions/schema.ts`).

## Locked decisions

1. **Extraction runs on the confirm screen**, on mount, behind a loading state — not in
   the scanner. Keeps the scanner thin and lets the user Retake / start editing without
   waiting on the spinner.
2. **Image source is local base64** read from `previewUri` via `expo-file-system`
   `File(previewUri).base64()`. No signed-URL download. (Diverges from the build-plan
   wording, which is fine — the image bytes are identical and `extractReceipt` already
   takes base64.)
3. **Persistence:** one transaction = the receipt **total**. Line items are flattened
   into the transaction **note** (comma-joined descriptions). The full raw Gemini
   response is stored in `receipts.raw_gemini_json` for the dev test set. No structured
   per-item rows.
4. **Note format:** comma-joined non-empty item *descriptions only* — no quantity, no
   amount (e.g. `Кафе еспресо, лимонада бъз, донът`).
5. **Total reconciliation:** soft warning only. If item amounts sum to something other
   than the total, show a subtle hint; Save is never blocked. Total stays authoritative.

## Flow

```
scanner (done): capture → compress → upload → router.replace(/confirm-receipt,
                                                 { storagePath, previewUri })
                                                  │
confirm-receipt (this work):                      ▼
  phase 'extracting': read base64 from previewUri → extractReceipt(base64)
                      skeleton/spinner over the fields
        │ ok:true                    │ ok:false / empty
        ▼                            ▼
  seed fields from extraction   empty fields + placeholders
        └──────────────┬─────────────┘
                       ▼ phase 'ready'
  user edits / Retake / Save
        │ Save
        ▼
  insertReceipt(...) → receiptId → createTransaction({ ..., receiptId })
        ▼
  router.replace('/(app)')
```

## Components & changes

### 1. `services/gemini.ts`
No change. `extractReceipt(base64)` reused.

### 2. `app/confirm-receipt.tsx` (major rework)
Replace the hardcoded Starbucks state with extraction-driven state and a phase machine:

- **`extracting`** — on mount: `File(previewUri).base64()` → `extractReceipt`. Show a
  skeleton/spinner in place of the field values. If `previewUri` is missing, skip
  straight to `ready` (manual fill).
- **`ready`** — fields populated (or empty on `ok:false`).

Fields:
- **Merchant** — `TextInput`, seeded from `extraction.merchant` (or empty → placeholder).
- **Total** — `TextInput`, seeded from `centsToInput(extraction.totalCents)` in BG comma
  format (`"12,50"`). Empty when extraction returns 0/null → placeholder.
- **Date** — replace the static text with the reused `DateField`. Default to
  `extraction.date`, else today (`toISODate()`).
- **Category** — replace the static text with a tappable field opening
  `CategoryPickerModal`. Auto-guess from merchant via `guessCategory` /
  `resolveCategoryId`; user can override (mirror manual-entry's `categoryTouched` logic).
- **Items** — keep the existing editable list, seeded from `extraction.items`.
- **Reconciliation hint** — when items are present and total is set and
  `itemsSumCents(items) !== totalCents`, render a subtle line under Total, e.g.
  `Артикулите сборуват €11,20 — общо €14,20`. Informational only; never disables Save.

Actions (unchanged layout — `SheetActions`/two-up pill row):
- **Отново (Retake)** → `router.replace('/scanner')`.
- **Запази (Save)** → validate + orchestrate save (below).

Failure handling: `{ ok: false }` or empty extraction yields the same `ready` screen with
empty fields and placeholders — no separate error screen (build-plan rule).

### 3. `features/receipts/api.ts` (new)
```ts
insertReceipt({
  householdId, userId, storagePath, rawGeminiJson,
}): Promise<{ id: string }>
```
Inserts a `receipts` row with `processed_at = now()`, returns the new id. The ONLY module
that writes the `receipts` table (mirrors the storage.ts chokepoint convention).

### 4. `features/transactions/api.ts`
Extend `NewTransaction` with optional `receiptId?: string | null`; `createTransaction`
sets `receipt_id: input.receiptId ?? null` and `source: 'receipt'` (new source tag
alongside `manual` / `dsk_import`).

### 5. Save orchestration (in the confirm screen or a small `features/receipts/save.ts`)
1. `parseManualEntry({ amount, merchant, note, date })` — amount > 0, merchant non-empty.
   On failure, show inline errors, abort.
2. `resolvedCategoryId` from picker selection or `resolveCategoryId(merchant, categories)`.
3. `note = itemsToNote(items)`.
4. `insertReceipt({ householdId, userId, storagePath, rawGeminiJson })` → `receiptId`.
5. `createTransaction({ householdId, userId, amountCents, merchant, categoryId,
   date, note, receiptId })`.
6. `refreshTransactions(householdId)` → `router.replace('/(app)')`.

Sequential inserts (receipt first, for the id). On a transaction-insert failure the
receipt row is orphaned — accepted (YAGNI; no RPC/transaction wrapper).

**Currency:** live scans happen in the 2026 EUR era → stored EUR-native
(`amount_eur = totalCents`, `original_amount` / `original_currency` null). Gemini's
`currency` field is display-only; no BGN conversion for live scans.

## Pure helpers + tests (TDD)

New pure module(s), each unit-tested:
- `itemsToNote(items)` → trim, drop empty descriptions, join with `, `.
- `itemsSumCents(items)` → sum of item `amountCents`.
- `extractionToForm(extraction)` → maps `ReceiptExtraction` → form seed
  (`merchant`, total input string, `date`, items with stable ids).
- `centsToInput(cents)` → BG comma decimal string. Extract the formatting currently
  inlined in `transactionToFormValues` (`(cents/100).toFixed(2).replace('.', ',')`) into
  this shared helper and reuse it in both `transactionToFormValues` and `extractionToForm`.

Save orchestration test with mocked supabase: asserts the `receipts` row is inserted
first and the `transactions` row carries the returned `receipt_id` and
`source: 'receipt'`.

## Out of scope

- Structured per-item rows (items persist only in the note + raw JSON).
- Signed-URL download path.
- BGN→EUR conversion for live scans.
- Hard/blocking reconciliation between items and total.

## Checkpoint (from build plan)

Photograph a Kaufland receipt → Gemini extracts merchant + total → fields pre-filled →
Save creates the linked transaction. A failed extraction yields an empty editable form,
not a crash.

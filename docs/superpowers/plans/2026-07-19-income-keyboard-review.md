# Income Tracking + Keyboard Handling + Review Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full income tracking (categories + transactions + imports + aggregates), keyboard-aware forms via react-native-keyboard-controller, and every change from `docs/code-review-2026-07-18.md`.

**Architecture:** `kind ('expense'|'income')` column on both `categories` and `transactions`; all spend math filters through new pure helpers (`expensesOnly` etc.). Gemini moves behind two Edge Functions. Transaction fetch is windowed to 12 months with a debounced realtime refetch. Three large screens split into feature components.

**Tech Stack:** React Native + Expo 56, TypeScript strict, Zustand, Supabase (Postgres/RLS/Edge Functions), Jest, NativeWind, react-native-keyboard-controller (new).

**Spec:** `docs/superpowers/specs/2026-07-19-income-keyboard-review-design.md`

## Global Constraints

- Money is INTEGER euro-cents everywhere; display only via `formatCurrency`. No floats.
- EUR (€) only; BGN legacy at fixed 1 EUR = 1.95583 BGN.
- TypeScript strict; no `any`; no plain `.js`.
- Conventional commits (`feat:` `fix:` `refactor:` `chore:` `test:` `docs:`), small commits, Co-Authored-By trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Migrations applied via Supabase MCP `apply_migration`; then rename the local file to the MCP-stamped version (project memory).
- `#c3f400` (secondary-fixed) is the anomaly accent ONLY — never use it for income.
- Free dependencies only.
- Run commands from repo root `D:\IT Partner\Python\Teftera`. Jest via `npm test -- <pattern>`; typecheck `npx tsc --noEmit`; lint `npm run lint`.
- After EVERY task: `npx tsc --noEmit` must pass before committing.

---

### Task 1: Housekeeping commit

**Files:**
- Modify: `.mcp.json` (add trailing newline only)
- Add to git: `.claude/settings.json`

- [ ] **Step 1:** Add a trailing newline to `.mcp.json` (content unchanged otherwise — it intentionally drops `&read_only=true` so migrations can be applied via MCP).
- [ ] **Step 2:** Commit:
```bash
git add .mcp.json .claude/settings.json
git commit -m "chore: track claude settings; supabase mcp read-write for migrations"
```

---

### Task 2: DB migration — `kind` on categories and transactions

**Files:**
- Create: `supabase/migrations/<mcp-version>_income_kind.sql`

**Interfaces:**
- Produces: `categories.kind` and `transactions.kind` columns (`'expense' | 'income'`, default `'expense'`); two seeded income categories per household: **Заплата** (`payments`, `#d8e3ff`) and **Друг приход** (`account-balance-wallet`, `#c4c6d0`).

- [ ] **Step 1:** Apply this migration via MCP tool `mcp__supabase__apply_migration` with name `income_kind`:

```sql
-- Income tracking: kind on categories + transactions, income default categories.
alter table public.categories add column kind text not null default 'expense';
alter table public.categories add constraint categories_kind_check
  check (kind in ('expense','income'));

alter table public.transactions add column kind text not null default 'expense';
alter table public.transactions add constraint transactions_kind_check
  check (kind in ('expense','income'));

-- Seed fn now also creates the two default income categories.
create or replace function public.seed_default_categories()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categories (household_id, name, icon, color, is_default, kind) values
    (new.id, 'Food & Dining', 'restaurant',              '#ffdfa7', true, 'expense'),
    (new.id, 'Beverages',     'local-cafe',               '#d8e3ff', true, 'expense'),
    (new.id, 'Groceries',     'shopping-basket',          '#adc7ff', true, 'expense'),
    (new.id, 'Transport',     'directions-car',           '#a8c8ff', true, 'expense'),
    (new.id, 'Housing',       'home',                     '#c4c6d0', true, 'expense'),
    (new.id, 'Utilities',     'bolt',                     '#ffdfa7', true, 'expense'),
    (new.id, 'Health',        'medical-services',         '#ffb4ab', true, 'expense'),
    (new.id, 'Entertainment', 'movie',                    '#d8e3ff', true, 'expense'),
    (new.id, 'Shopping',      'shopping-bag',             '#adc7ff', true, 'expense'),
    (new.id, 'Other',         'category',                 '#8e909a', true, 'expense'),
    (new.id, 'Заплата',       'payments',                 '#d8e3ff', true, 'income'),
    (new.id, 'Друг приход',   'account-balance-wallet',   '#c4c6d0', true, 'income');
  return new;
end;
$$;

-- Backfill income categories for existing households.
insert into public.categories (household_id, name, icon, color, is_default, kind)
select h.id, v.name, v.icon, v.color, true, 'income'
from public.households h
cross join (values
  ('Заплата', 'payments', '#d8e3ff'),
  ('Друг приход', 'account-balance-wallet', '#c4c6d0')
) as v(name, icon, color)
where not exists (
  select 1 from public.categories c
  where c.household_id = h.id and c.kind = 'income' and c.name = v.name
);
```

- [ ] **Step 2:** Verify: `mcp__supabase__execute_sql` with `select name, kind, is_default from categories order by kind, name;` — expect the 10 expense + 2 income rows per household. Run `mcp__supabase__get_advisors` (type `security`) — expect no NEW findings (pre-existing intentional exceptions per project memory).
- [ ] **Step 3:** `mcp__supabase__list_migrations` → note the new version stamp; write the SQL above to `supabase/migrations/<version>_income_kind.sql`.
- [ ] **Step 4:** Commit: `git add supabase/migrations && git commit -m "feat(income): kind column on categories and transactions + income seed"`

---

### Task 3: Kind types, helpers, and API plumbing

**Files:**
- Create: `features/transactions/kind.ts`, `features/transactions/kind.test.ts`
- Modify: `features/transactions/types.ts`, `features/transactions/groupByDay.ts` (CategoryLite), `features/transactions/api.ts`

**Interfaces:**
- Produces:
  - `type TxKind = 'expense' | 'income'` and `expensesOnly<T extends {kind: TxKind}>(rows: T[]): T[]`, `incomeOnly`, `expenseCategories` (alias of `expensesOnly`), `incomeCategories` (alias of `incomeOnly`) — all in `features/transactions/kind.ts`.
  - `Transaction.kind: TxKind`; `CategoryLite.kind: TxKind`.
  - `NewTransaction.kind?: TxKind` (insert defaults `'expense'`); `TransactionPatch.kind: TxKind`; `ImportedTransaction.kind: TxKind`.
  - `createCategory` input gains `kind: TxKind`.

- [ ] **Step 1: Write failing tests** — `features/transactions/kind.test.ts`:

```ts
import { expensesOnly, incomeOnly, expenseCategories, incomeCategories } from './kind';

const rows = [
  { id: 'a', kind: 'expense' as const },
  { id: 'b', kind: 'income' as const },
  { id: 'c', kind: 'expense' as const },
];

describe('kind helpers', () => {
  it('expensesOnly keeps only expenses', () => {
    expect(expensesOnly(rows).map((r) => r.id)).toEqual(['a', 'c']);
  });
  it('incomeOnly keeps only income', () => {
    expect(incomeOnly(rows).map((r) => r.id)).toEqual(['b']);
  });
  it('category aliases behave identically', () => {
    expect(expenseCategories(rows)).toEqual(expensesOnly(rows));
    expect(incomeCategories(rows)).toEqual(incomeOnly(rows));
  });
  it('empty input → empty output', () => {
    expect(expensesOnly([])).toEqual([]);
  });
});
```

- [ ] **Step 2:** `npm test -- kind.test` → FAIL (module not found).
- [ ] **Step 3: Implement** `features/transactions/kind.ts`:

```ts
// features/transactions/kind.ts — the single choke point for expense/income splits.
export type TxKind = 'expense' | 'income';

interface HasKind {
  kind: TxKind;
}

export function expensesOnly<T extends HasKind>(rows: T[]): T[] {
  return rows.filter((r) => r.kind === 'expense');
}

export function incomeOnly<T extends HasKind>(rows: T[]): T[] {
  return rows.filter((r) => r.kind === 'income');
}

/** Same predicates, named for category lists. */
export const expenseCategories = expensesOnly;
export const incomeCategories = incomeOnly;
```

- [ ] **Step 4:** `npm test -- kind.test` → PASS.
- [ ] **Step 5: Type plumbing.**
  - `features/transactions/types.ts`: add to `Transaction` (after `source`): `kind: 'expense' | 'income';`
  - `features/transactions/groupByDay.ts` `CategoryLite`: add `kind: 'expense' | 'income';`
  - `features/transactions/api.ts`:
    - Add near the top:
    ```ts
    /** Explicit column list — never select('*') (review #5). */
    const TRANSACTION_COLUMNS =
      'id, household_id, user_id, amount_eur, original_amount, original_currency, ' +
      'merchant, category_id, date, note, source, receipt_id, is_flagged, occurred_at, created_at, kind';
    ```
    - `listTransactions`: `.select(TRANSACTION_COLUMNS)` instead of `select('*')`.
    - `listCategories`: select `'id, name, icon, color, is_default, kind'`.
    - `NewTransaction`: add `kind?: 'expense' | 'income';` — in `createTransaction` insert: `kind: input.kind ?? 'expense',`
    - `TransactionPatch`: add `kind: 'expense' | 'income';` — in `updateTransaction` update object: `kind: patch.kind,`
    - `ImportedTransaction`: add `kind: 'expense' | 'income';` — in `bulkInsertImported` row map: `kind: r.kind,`
    - `createCategory` input: add `kind: 'expense' | 'income'` and pass `kind: input.kind` in the insert.
- [ ] **Step 6:** `npx tsc --noEmit` → it will list every fixture/call-site missing `kind`. Fix each mechanically: test fixtures and screen call sites get `kind: 'expense'` (e.g. `categories.tsx` `createCategory` call gets `kind: 'expense'` for now — Task 19 makes it real; `manual-entry.tsx` `updateTransaction` patch gets `kind: existing?.kind ?? 'expense'` for now — Task 15 makes it real; `import-dsk.tsx` `ImportedTransaction` map gets `kind: r.kind` since `NormalizedTransaction` already has it).
- [ ] **Step 7:** `npm test` → all suites PASS. Commit: `git commit -am "feat(income): kind types, helpers, api plumbing"`

---

### Task 4: Unified merchant table + income category rules

**Files:**
- Modify: `lib/categories.ts`, `lib/categories.test.ts`, `services/dsk-import.ts` (delete local `BRAND_RULES`, import from lib)
- Test also: `services/dsk-import.test.ts` (must stay green)

**Interfaces:**
- Produces (all from `lib/categories.ts`):
  - `MERCHANT_TABLE: ReadonlyArray<readonly [RegExp, string | null, string]>` — `[pattern, brandDisplayName | null, categoryName]`, first match wins.
  - `BRAND_RULES: ReadonlyArray<readonly [RegExp, string]>` — derived (rows with non-null brand). Consumed by `services/dsk-import.ts` `normalizeMerchant`.
  - `guessCategory(merchant: string): string` (unchanged signature), `guessIncomeCategory(merchant: string): string`
  - `resolveCategoryId(merchant: string, categories: ReadonlyArray<{ id: string; name: string; kind?: 'expense' | 'income' }>, kind?: 'expense' | 'income'): string | null`
  - `DEFAULT_CATEGORIES` entries gain `kind`; two income entries appended (must mirror Task 2 seed exactly).

- [ ] **Step 1: Write failing tests** — append to `lib/categories.test.ts`:

```ts
import { guessIncomeCategory, BRAND_RULES } from './categories';

describe('income rules', () => {
  it('salary keywords → Заплата', () => {
    expect(guessIncomeCategory('ЗАПЛАТА ЮНИ 2026')).toBe('Заплата');
    expect(guessIncomeCategory('Salary payment ACME')).toBe('Заплата');
  });
  it('unknown income → Друг приход', () => {
    expect(guessIncomeCategory('IBAN превод Иван')).toBe('Друг приход');
  });
});

describe('unified merchant table', () => {
  it('dm is branded and categorized as Shopping (was Other)', () => {
    expect(guessCategory('BGR SOFIA DM 340')).toBe('Shopping');
    expect(BRAND_RULES.some(([re, brand]) => brand === 'dm' && re.test('DM 340'))).toBe(true);
  });
});

describe('kind-aware resolveCategoryId', () => {
  const cats = [
    { id: 'e1', name: 'Groceries', kind: 'expense' as const },
    { id: 'e2', name: 'Other', kind: 'expense' as const },
    { id: 'i1', name: 'Заплата', kind: 'income' as const },
    { id: 'i2', name: 'Друг приход', kind: 'income' as const },
  ];
  it('income guess maps to income category', () => {
    expect(resolveCategoryId('ЗАПЛАТА ЮНИ', cats, 'income')).toBe('i1');
  });
  it('unknown income falls back to Друг приход', () => {
    expect(resolveCategoryId('превод', cats, 'income')).toBe('i2');
  });
  it('expense default is unchanged', () => {
    expect(resolveCategoryId('LIDL SOFIA', cats)).toBe('e1');
  });
  it('income never resolves to an expense category', () => {
    expect(resolveCategoryId('lidl', cats, 'income')).toBe('i2');
  });
});
```

(Adjust imports at the top of the test file to include the new exports.)

- [ ] **Step 2:** `npm test -- categories.test` → FAIL.
- [ ] **Step 3: Implement in `lib/categories.ts`.** Replace `MERCHANT_RULES` with the unified table; keep the PERSONAL MERCHANTS banner comment verbatim at the top of the table (owner-maintained — project memory). Preserve current first-match order semantics (Beverages keyword row stays before Groceries rows):

```ts
/**
 * Unified merchant knowledge: [pattern, brand display name | null, category].
 * First match wins for BOTH brand normalization (rows with a brand) and
 * category guessing. dsk-import derives its BRAND_RULES from this table.
 */
export const MERCHANT_TABLE: ReadonlyArray<readonly [RegExp, string | null, string]> = [
  // ── PERSONAL MERCHANTS (household-specific overrides) ────────────────────
  // Add [/pattern/i, null, 'Category'] lines here for small local shops.
  // These run FIRST, so they always win over the generic rules below.

  // ── BEVERAGES (before Groceries so "coffee" inside a market name wins) ───
  [/starbucks|coffee\b|cafe\b|кафе/i, null, 'Beverages'],

  // ── GROCERIES ────────────────────────────────────────────────────────────
  [/\blidl\b/i, 'Lidl', 'Groceries'],
  [/kaufland/i, 'Kaufland', 'Groceries'],
  [/billa/i, 'Billa', 'Groceries'],
  [/fantastico/i, 'Fantastico', 'Groceries'],
  [/t[\s-]market|\bmarket\b|\bcba\b|metro\s+cash|супермаркет|магазин/i, null, 'Groceries'],

  // ── FOOD & DINING ────────────────────────────────────────────────────────
  [/restaurant|mcdonald|kfc|pizza|burger|kebab|\bbar\b|grill|грил|ресторан|glovo/i, null, 'Food & Dining'],

  // ── TRANSPORT ────────────────────────────────────────────────────────────
  [/\bomv\b/i, 'OMV', 'Transport'],
  [/shell/i, 'Shell', 'Transport'],
  [/\beko\b|lukoil|petrol\b|бензин|\bbolt\b|uber|\btaxi\b|такси/i, null, 'Transport'],

  // ── HEALTH ───────────────────────────────────────────────────────────────
  [/sopharmacy/i, 'SOpharmacy', 'Health'],
  [/apteka|аптека|pharma|аптеч|болница|hospital|clinic|медицин|\bsmdl\b|лаборатор/i, null, 'Health'],

  // ── ENTERTAINMENT ────────────────────────────────────────────────────────
  [/netflix/i, 'Netflix', 'Entertainment'],
  [/spotify/i, 'Spotify', 'Entertainment'],
  [/anthropic/i, 'Anthropic', 'Entertainment'],
  [/hbo|youtube|\bsteam\b|openai|cinema|kino|кино/i, null, 'Entertainment'],

  // ── UTILITIES ────────────────────────────────────────────────────────────
  [/vivacom|\ba1\b|yettel|telenor|топлофикация|toplofikatsia|в\s+и\s+к|(?<![а-яА-Я])вик(?![а-яА-Я])|водоснабд|електро|(?<![а-яА-Я])ток(?![а-яА-Я])|(?<![а-яА-Я])вода(?![а-яА-Я])|internet|интернет/i, null, 'Utilities'],

  // ── HOUSING ──────────────────────────────────────────────────────────────
  [/\brent\b|наем|mortgage|ипотек/i, null, 'Housing'],

  // ── SHOPPING ─────────────────────────────────────────────────────────────
  [/\bdm\b/i, 'dm', 'Shopping'],
  [/emag|technopolis|technomarket|zara|h&m|pepco|bulmag|\bmall\b|(?<![а-яА-Я])мол(?![а-яА-Я])|amazon|ikea|jysk/i, null, 'Shopping'],
];

/** Brand normalization rules, derived — consumed by services/dsk-import.ts. */
export const BRAND_RULES: ReadonlyArray<readonly [RegExp, string]> = MERCHANT_TABLE.filter(
  (row): row is readonly [RegExp, string, string] => row[1] !== null,
).map(([re, brand]) => [re, brand] as const);

export function guessCategory(merchant: string): string {
  for (const [pattern, , category] of MERCHANT_TABLE) {
    if (pattern.test(merchant)) return category;
  }
  return 'Other';
}

const INCOME_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/заплата|salary|payroll|възнаграждение|осигур|пенси/i, 'Заплата'],
];

/** Guess an income category name; fallback 'Друг приход'. */
export function guessIncomeCategory(merchant: string): string {
  for (const [pattern, category] of INCOME_RULES) {
    if (pattern.test(merchant)) return category;
  }
  return 'Друг приход';
}

export function resolveCategoryId(
  merchant: string,
  categories: ReadonlyArray<{ id: string; name: string; kind?: 'expense' | 'income' }>,
  kind: 'expense' | 'income' = 'expense',
): string | null {
  const pool = categories.filter((c) => (c.kind ?? 'expense') === kind);
  const guessed = kind === 'income' ? guessIncomeCategory(merchant) : guessCategory(merchant);
  const match = pool.find((c) => c.name === guessed);
  if (match) return match.id;
  const fallbackName = kind === 'income' ? 'Друг приход' : 'Other';
  const fallback = pool.find((c) => c.name === fallbackName);
  return fallback ? fallback.id : null;
}
```

Also: `DefaultCategory` gains `kind: 'expense' | 'income'`; all 10 existing `DEFAULT_CATEGORIES` entries get `kind: 'expense'`; append (mirroring Task 2):

```ts
  { name: 'Заплата', icon: 'payments', color: '#d8e3ff', kind: 'income' },
  { name: 'Друг приход', icon: 'account-balance-wallet', color: '#c4c6d0', kind: 'income' },
```

- [ ] **Step 4:** In `services/dsk-import.ts`: delete the local `BRAND_RULES` const, add `BRAND_RULES` to the existing `import { guessCategory } from '@/lib/categories';` line. `normalizeMerchant` body unchanged.
- [ ] **Step 5:** `npm test -- categories dsk-import` → PASS (existing brand/category expectations must not regress; if a pre-existing test pinned `guessCategory('DM ...')` to `'Other'`, update it to `'Shopping'` — that behavior change is the point).
- [ ] **Step 6:** `npx tsc --noEmit` → PASS. Commit: `git commit -am "feat(income): income rules + unified merchant table (fixes dm→Other)"`

---

### Task 5: Import normalizers — kind-aware dedup, zero-amount drop, EB debtor fix

**Files:**
- Modify: `features/transactions/dedup.ts`, `features/transactions/dedup.test.ts`, `services/dsk-import.ts`, `services/dsk-import.test.ts`, `services/bank-sync.ts`, `services/bank-sync.test.ts`

**Interfaces:**
- Produces:
  - `importKey(kind: 'expense' | 'income', date: string, amountEurCents: number, merchant: string): string`
  - `DedupCandidate` gains `kind: 'expense' | 'income'`. `dedupeImport` signature unchanged.
  - `normalizeDskRow(row): NormalizedTransaction | null` — **now nullable** (null for zero-amount rows). Callers must filter.
  - `EbTransaction` gains `debtor?: { name?: string | null } | null`.
  - `normalizeEbTransaction` returns null for zero-amount rows; CRDT counterparty comes from `debtor`.

- [ ] **Step 1: Write failing tests.**

Append to `features/transactions/dedup.test.ts` (update existing `importKey` call sites in the file to the new 4-arg signature with `'expense'`):

```ts
it('same date/amount/merchant but different kind do NOT collide', () => {
  expect(importKey('expense', '2026-07-01', 1000, 'ACME')).not.toBe(
    importKey('income', '2026-07-01', 1000, 'ACME'),
  );
});
```

Append to `services/dsk-import.test.ts`:

```ts
it('drops rows with zero amount (both debit and credit empty)', () => {
  const row = {
    date: '01.07.2026', merchantRaw: 'INFO ROW', description: '', debit: '', credit: '',
    time: '', currency: 'EUR' as const,
  };
  expect(normalizeDskRow(row)).toBeNull();
});
```

Append to `services/bank-sync.test.ts` (base a valid `EbTransaction` on the file's existing fixtures):

```ts
it('income (CRDT) merchant comes from debtor, not creditor', () => {
  const r = normalizeEbTransaction({
    transaction_amount: { amount: '1500.00', currency: 'EUR' },
    credit_debit_indicator: 'CRDT',
    status: 'BOOK',
    booking_date: '2026-07-01',
    creditor: { name: 'MY OWN ACCOUNT' },
    debtor: { name: 'ACME LTD' },
    remittance_information: null,
  });
  expect(r?.merchant).toBe('ACME LTD');
});

it('drops zero-amount EB rows', () => {
  const r = normalizeEbTransaction({
    transaction_amount: { amount: '0.00', currency: 'EUR' },
    credit_debit_indicator: 'DBIT',
    status: 'BOOK',
    booking_date: '2026-07-01',
    creditor: { name: 'X' },
    remittance_information: null,
  });
  expect(r).toBeNull();
});
```

- [ ] **Step 2:** `npm test -- dedup dsk-import bank-sync` → FAIL.
- [ ] **Step 3: Implement.**

`features/transactions/dedup.ts`:

```ts
export interface DedupCandidate {
  kind: 'expense' | 'income';
  date: string; // YYYY-MM-DD
  amountEurCents: number;
  merchant: string;
}

/** Normalized dedup key: kind + date + EUR cents + case/space-insensitive merchant. */
export function importKey(
  kind: 'expense' | 'income',
  date: string,
  amountEurCents: number,
  merchant: string,
): string {
  return `${kind}|${date}|${amountEurCents}|${merchant.trim().toLowerCase()}`;
}
```

In `dedupeImport`, build keys as `importKey(t.kind, t.date, t.amount_eur, t.merchant)` for existing and `importKey(c.kind, c.date, c.amountEurCents, c.merchant)` for candidates.

`services/dsk-import.ts` — `normalizeDskRow` return type becomes `NormalizedTransaction | null`; after computing `rawCents` add:

```ts
  if (rawCents === 0) return null; // info rows / both columns empty — nothing to import
```

`services/bank-sync.ts` — `EbTransaction` gains `debtor?: { name?: string | null } | null;`. In `normalizeEbTransaction`, after `rawCents`:

```ts
  if (rawCents === 0) return null;
```

and replace the `rawMerchant` line:

```ts
  const isIncome = tx.credit_debit_indicator === 'CRDT';
  const counterparty = isIncome ? tx.debtor?.name : tx.creditor?.name;
  const rawMerchant =
    counterparty?.trim() || (tx.remittance_information ?? []).join(' ').trim();
```

(and use `isIncome` for `kind` below.)

- [ ] **Step 4:** `npm test -- dedup dsk-import bank-sync` → PASS. `npx tsc --noEmit` → fix `app/import-dsk.tsx` CSV path: `parseDskCsv(text).map(normalizeDskRow).filter((r): r is NonNullable<typeof r> => r !== null)`.
- [ ] **Step 5:** Commit: `git commit -am "fix(import): kind-aware dedup, drop zero rows, EB income counterparty"`

---

### Task 6: Money/date polish (review Priority 3)

**Files:**
- Modify: `lib/formatCurrency.ts`, `services/dsk-import.ts` (`parseBgAmount`, `occurredAtISO`), `services/dsk-import.test.ts`

- [ ] **Step 1: Write failing test** — append to `services/dsk-import.test.ts`:

```ts
it('occurredAtISO with a non-ISO date still returns a parseable timestamp when possible', () => {
  // regex fails → falls back to Date parsing → midnight ISO
  const out = occurredAtISO('2026-7-1', '10:30');
  expect(Number.isNaN(new Date(out).getTime())).toBe(false);
});
```

- [ ] **Step 2:** `npm test -- dsk-import` → confirm the new test FAILS (current code returns the raw string `'2026-7-1'`, which `new Date` CAN parse — if it passes trivially, strengthen: `expect(out.endsWith('Z')).toBe(true);`).
- [ ] **Step 3: Implement.**

`lib/formatCurrency.ts` — cache the formatter:

```ts
let bgNumberFormat: Intl.NumberFormat | null | undefined; // undefined = not tried, null = unavailable

function getBgNumberFormat(): Intl.NumberFormat | null {
  if (bgNumberFormat === undefined) {
    try {
      bgNumberFormat = new Intl.NumberFormat('bg-BG', {
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    } catch {
      // Runtime lacks full Intl (older Hermes builds).
      bgNumberFormat = null;
    }
  }
  return bgNumberFormat;
}
```

In `formatCurrency`, replace the try/catch block:

```ts
  const fmt = getBgNumberFormat();
  const number = fmt ? fmt.format(abs) : abs.toFixed(2).replace('.', ',');
```

`services/dsk-import.ts` `parseBgAmount` — drop the redundant replace, add the guard comment:

```ts
export function parseBgAmount(raw: string): number {
  // DSK always formats comma-decimal ("1 234,56"). A dot here is a thousands
  // separator; do NOT reuse this parser for dot-decimal sources.
  const cleaned = raw
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const value = Number(cleaned);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}
```

`occurredAtISO` — the non-matching branch:

```ts
  if (!dm) {
    const parsed = new Date(isoDate);
    return Number.isNaN(parsed.getTime()) ? isoDate : parsed.toISOString();
  }
```

- [ ] **Step 4:** `npm test -- dsk-import formatCurrency` → PASS. Commit: `git commit -am "refactor: cached currency formatter, tighter DSK amount/date parsing"`

---

### Task 7: 12-month window + debounced realtime refetch + anomaly history window

**Files:**
- Create: `lib/debounce.ts`, `lib/debounce.test.ts`
- Modify: `lib/dates.ts`, `lib/dates.test.ts`, `features/transactions/api.ts`, `features/transactions/sync.ts`, `features/anomalies/detect.ts`, `features/anomalies/detect.test.ts`, `features/anomalies/runDetection.ts`

**Interfaces:**
- Produces:
  - `windowStartISO(months: number, now?: Date): string` in `lib/dates.ts` — first day of the month `months-1` months back (a `months`-month window including the current month). Consumed by `listTransactions`, `runDetection`, and Task 13's out-of-window notice.
  - `TRANSACTION_WINDOW_MONTHS = 12` exported from `features/transactions/api.ts`.
  - `trailingDebounce(fn: () => void, ms: number): { call(): void; cancel(): void }` in `lib/debounce.ts`.
  - `historyForCategory(txs, categoryId, excludeId, sinceISO?: string)` — extra optional arg; also now skips income rows.

- [ ] **Step 1: Write failing tests.**

`lib/dates.test.ts`:

```ts
describe('windowStartISO', () => {
  it('12-month window from mid-July 2026 starts 2025-08-01', () => {
    expect(windowStartISO(12, new Date(2026, 6, 15))).toBe('2025-08-01');
  });
  it('1-month window is the first of the current month', () => {
    expect(windowStartISO(1, new Date(2026, 6, 15))).toBe('2026-07-01');
  });
});
```

`lib/debounce.test.ts`:

```ts
import { trailingDebounce } from './debounce';

describe('trailingDebounce', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('collapses a burst into one trailing call', () => {
    const fn = jest.fn();
    const d = trailingDebounce(fn, 400);
    d.call(); d.call(); d.call();
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(400);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancel prevents the pending call', () => {
    const fn = jest.fn();
    const d = trailingDebounce(fn, 400);
    d.call();
    d.cancel();
    jest.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});
```

`features/anomalies/detect.test.ts` — append (reuse the file's existing tx fixture helper, adding `kind`):

```ts
it('history excludes income rows and rows older than sinceISO', () => {
  const txs = [
    tx({ id: '1', category_id: 'c', amount_eur: 100, date: '2026-07-01', kind: 'expense' }),
    tx({ id: '2', category_id: 'c', amount_eur: 999, date: '2026-07-02', kind: 'income' }),
    tx({ id: '3', category_id: 'c', amount_eur: 200, date: '2025-01-01', kind: 'expense' }),
  ];
  expect(historyForCategory(txs, 'c', 'x', '2026-01-01')).toEqual([100]);
});
```

- [ ] **Step 2:** Run the three suites → FAIL.
- [ ] **Step 3: Implement.**

`lib/dates.ts`:

```ts
/** First day of the month `months-1` months before `now` — start of a `months`-month window including the current month. */
export function windowStartISO(months: number, now: Date = new Date()): string {
  return toISODate(new Date(now.getFullYear(), now.getMonth() - (months - 1), 1));
}
```

`lib/debounce.ts`:

```ts
/** Trailing-edge debounce with cancellation (no leading call). */
export function trailingDebounce(
  fn: () => void,
  ms: number,
): { call: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    call() {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn();
      }, ms);
    },
    cancel() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
```

`features/transactions/api.ts`:

```ts
import { windowStartISO } from '@/lib/dates';

/** Transactions are fetched for the last N months only (review #5). */
export const TRANSACTION_WINDOW_MONTHS = 12;
```

`listTransactions` adds `.gte('date', windowStartISO(TRANSACTION_WINDOW_MONTHS))` before the orders.

`features/transactions/sync.ts` — inside the effect, replace the direct subscription callback:

```ts
    const reload = trailingDebounce(() => void load(), 400);
    const unsubscribe = subscribeToTransactions(supabase, householdId, () => reload.call());

    return () => {
      active = false;
      reload.cancel();
      unsubscribe();
    };
```

(import `trailingDebounce` from `@/lib/debounce`; initial `load()` stays direct.)

`features/anomalies/detect.ts`:

```ts
export function historyForCategory(
  txs: Transaction[],
  categoryId: string | null,
  excludeId: string,
  sinceISO?: string,
): number[] {
  return txs
    .filter(
      (tx) =>
        tx.id !== excludeId &&
        tx.category_id === categoryId &&
        tx.kind === 'expense' &&
        (sinceISO === undefined || tx.date >= sinceISO),
    )
    .map((tx) => tx.amount_eur);
}
```

`features/anomalies/runDetection.ts` — pass the window:

```ts
import { windowStartISO } from '@/lib/dates';
// in runDetection:
const history = historyForCategory(
  input.transactions,
  input.categoryId,
  input.transactionId,
  windowStartISO(6),
);
```

- [ ] **Step 4:** All suites + `npx tsc --noEmit` → PASS. Commit: `git commit -am "feat(perf): 12-month transaction window, debounced realtime refetch, windowed anomaly history"`

---

### Task 8: Auth bootstrap failure path + token-refresh guard

**Files:**
- Create: `components/AuthErrorScreen.tsx`, `features/auth/sessionEvents.ts`, `features/auth/sessionEvents.test.ts`
- Modify: `features/auth/resolveRedirect.ts`, `features/auth/resolveRedirect.test.ts`, `features/auth/bootstrap.ts`, `app/_layout.tsx`

**Interfaces:**
- Produces:
  - `AuthStatus` gains `'error'`; `resolveRedirect('error', …)` → `null`.
  - `shouldSkipAuthEvent(event: string, userId: string | undefined, lastAppliedUserId: string | null, status: AuthStatus): boolean` in `features/auth/sessionEvents.ts`.
  - `retryBootstrap(): void` exported from `features/auth/bootstrap.ts` (consumed by `AuthErrorScreen` via `app/_layout.tsx`).

- [ ] **Step 1: Write failing tests.**

`features/auth/resolveRedirect.test.ts` — append:

```ts
it("status 'error' never redirects (root layout shows the retry screen)", () => {
  expect(resolveRedirect('error', ['(app)'])).toBeNull();
  expect(resolveRedirect('error', ['(auth)', 'sign-in'])).toBeNull();
});
```

`features/auth/sessionEvents.test.ts`:

```ts
import { shouldSkipAuthEvent } from './sessionEvents';

describe('shouldSkipAuthEvent', () => {
  it('skips TOKEN_REFRESHED for the same, already-ready user', () => {
    expect(shouldSkipAuthEvent('TOKEN_REFRESHED', 'u1', 'u1', 'ready')).toBe(true);
  });
  it('does not skip a different user', () => {
    expect(shouldSkipAuthEvent('TOKEN_REFRESHED', 'u2', 'u1', 'ready')).toBe(false);
  });
  it('does not skip SIGNED_IN or non-ready status', () => {
    expect(shouldSkipAuthEvent('SIGNED_IN', 'u1', 'u1', 'ready')).toBe(false);
    expect(shouldSkipAuthEvent('TOKEN_REFRESHED', 'u1', 'u1', 'error')).toBe(false);
  });
});
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.**

`resolveRedirect.ts`: `export type AuthStatus = 'loading' | 'unauthenticated' | 'needs-household' | 'ready' | 'error';` and add `case 'error': return null;`.

`features/auth/sessionEvents.ts`:

```ts
import type { AuthStatus } from './resolveRedirect';

/** True when an auth event is a routine token refresh for the already-applied user. */
export function shouldSkipAuthEvent(
  event: string,
  userId: string | undefined,
  lastAppliedUserId: string | null,
  status: AuthStatus,
): boolean {
  return (
    event === 'TOKEN_REFRESHED' &&
    userId !== undefined &&
    userId === lastAppliedUserId &&
    status === 'ready'
  );
}
```

`features/auth/bootstrap.ts` — full rewrite of the hydration half:

```ts
// features/auth/bootstrap.ts
import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';
import { getMyHousehold } from '@/features/household/api';
import { resolveRedirect } from './resolveRedirect';
import { shouldSkipAuthEvent } from './sessionEvents';
import { useAuthStore } from './store';

let lastAppliedUserId: string | null = null;

/** Apply a session to the store. A failed household lookup → status 'error' (retry screen). */
async function applySession(session: Session | null): Promise<void> {
  const { setStatus, setSession, setHousehold, reset } = useAuthStore.getState();
  if (!session) {
    lastAppliedUserId = null;
    reset();
    return;
  }
  setSession(session);
  try {
    const household = await getMyHousehold();
    lastAppliedUserId = session.user.id;
    if (household) {
      setHousehold(household.householdId, household.displayName);
      setStatus('ready');
    } else {
      const metadataName =
        (session.user.user_metadata?.display_name as string | undefined) ?? null;
      setHousehold(null, metadataName);
      setStatus('needs-household');
    }
  } catch (err) {
    if (__DEV__) console.warn('[auth] bootstrap household lookup failed', err);
    setStatus('error');
  }
}

/** (Re)start hydration: also the retry action for the error screen. */
export function retryBootstrap(): void {
  useAuthStore.getState().setStatus('loading');
  supabase.auth
    .getSession()
    .then(({ data }) => applySession(data.session))
    .catch((err) => {
      if (__DEV__) console.warn('[auth] getSession failed', err);
      useAuthStore.getState().setStatus('error');
    });
}

/** Hydrate the auth store from Supabase and keep it live. Call once, in the root layout. */
export function useAuthBootstrap(): void {
  useEffect(() => {
    retryBootstrap();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        shouldSkipAuthEvent(event, session?.user.id, lastAppliedUserId, useAuthStore.getState().status)
      ) {
        return;
      }
      void applySession(session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
}
```

(`useProtectedRoute` unchanged.) Note: the old `active` unmount flag is dropped deliberately — the root layout never unmounts while the app is alive.

`components/AuthErrorScreen.tsx`:

```tsx
import { Pressable, Text, View } from 'react-native';
import { BackgroundGlow } from './BackgroundGlow';

/** Full-screen fallback when auth bootstrap fails (e.g. offline cold start). */
export function AuthErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <View className="flex-1 items-center justify-center bg-background px-8">
      <BackgroundGlow />
      <Text className="text-center font-jakarta-semibold text-headline-md text-on-surface">
        Нещо се обърка
      </Text>
      <Text className="mt-sm text-center font-inter text-body-md text-on-surface-variant opacity-70">
        Няма връзка със сървъра. Провери интернета и опитай отново.
      </Text>
      <Pressable
        onPress={onRetry}
        className="mt-lg rounded-full bg-primary-container px-8 py-3 active:opacity-80">
        <Text className="font-inter-semibold text-label-md uppercase text-on-primary">
          Опитай отново
        </Text>
      </Pressable>
    </View>
  );
}
```

`app/_layout.tsx` — import `AuthErrorScreen` and `retryBootstrap`; replace the `<Stack>` render with:

```tsx
      {status === 'error' ? (
        <AuthErrorScreen onRetry={retryBootstrap} />
      ) : (
        <Stack …unchanged…>…</Stack>
      )}
```

(The splash-hide effect already fires for any non-`loading` status, so `error` dismisses the splash.)

- [ ] **Step 4:** Tests + `npx tsc --noEmit` → PASS. Commit: `git commit -am "fix(auth): error status + retry screen for failed bootstrap; skip redundant token-refresh requeries"`

---

### Task 9: Gemini Edge Functions (`gemini-extract`, `gemini-summary`)

**Files:**
- Create: `supabase/functions/_shared/auth.ts`, `supabase/functions/gemini-extract/index.ts`, `supabase/functions/gemini-summary/index.ts`
- Modify: `supabase/functions/_shared/eb.ts` (import shared bits from auth.ts; also add review #6 comments here and in `bank-sync-callback`)

**Interfaces:**
- Produces:
  - `_shared/auth.ts`: `json(status, body)`, `adminClient()`, `getCallerHousehold(req)` — moved verbatim from `eb.ts`; `eb.ts` re-exports them so the bank-sync functions keep their imports.
  - `POST /functions/v1/gemini-extract` body `{ image: string (base64), mimeType?: string }` → `200 { json: unknown }` | `400 bad_request` | `401 unauthorized` | `422 bad_response` | `429 rate_limited` | `502 gemini_error`.
  - `POST /functions/v1/gemini-summary` body `{ prompt: string }` (≤2000 chars) → `200 { text: string }` | same error statuses.
  - Secret `GEMINI_API_KEY` set on the project.

- [ ] **Step 1:** Create `_shared/auth.ts` by MOVING (cut, not copy) `json`, `adminClient`, and `getCallerHousehold` from `eb.ts`, plus the needed imports (`createClient`). Add above `getCallerHousehold`:

```ts
// NOTE: assumes the one-household-per-user model — with multiple memberships
// this picks the earliest joined. Revisit if multi-household ever ships.
```

In `eb.ts`, add `export { json, adminClient, getCallerHousehold } from './auth.ts';` and delete the moved code. In `bank-sync-callback/index.ts`, above the `accountUid` line add:

```ts
    // Single-account assumption: EB returns the consented accounts; we store
    // accounts[0]. DSK personal banking exposes one main account — revisit if
    // an account picker is ever needed.
```

- [ ] **Step 2:** Create `supabase/functions/gemini-extract/index.ts`:

```ts
// POST { image, mimeType? } → { json } — receipt extraction via Gemini with a
// structured-output schema. GEMINI_API_KEY exists only here, server-side.
import { getCallerHousehold, json } from '../_shared/auth.ts';

const MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const EXTRACTION_PROMPT = `You are a receipt parser. Extract the data from this receipt image.
Amounts are decimal major units (e.g. 12.50). Use EUR unless the receipt is clearly in Bulgarian leva (лв/BGN). date is the receipt date as YYYY-MM-DD, or null if not visible.`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    merchant: { type: 'STRING' },
    date: { type: 'STRING', nullable: true },
    total: { type: 'NUMBER' },
    currency: { type: 'STRING', enum: ['EUR', 'BGN'] },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { description: { type: 'STRING' }, amount: { type: 'NUMBER' } },
        required: ['description', 'amount'],
      },
    },
  },
  required: ['merchant', 'total', 'currency', 'items'],
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const caller = await getCallerHousehold(req);
  if (!caller) return json(401, { error: 'unauthorized' });
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) return json(500, { error: 'not_configured' });

  let body: { image?: unknown; mimeType?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'bad_request' });
  }
  if (typeof body.image !== 'string' || body.image.length === 0) {
    return json(400, { error: 'bad_request' });
  }
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType : 'image/jpeg';

  const res = await fetch(`${GEMINI_URL}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        { parts: [{ text: EXTRACTION_PROMPT }, { inline_data: { mime_type: mimeType, data: body.image } }] },
      ],
      generationConfig: { response_mime_type: 'application/json', response_schema: RESPONSE_SCHEMA },
    }),
  });
  if (res.status === 429) return json(429, { error: 'rate_limited' });
  if (!res.ok) {
    console.error('[gemini-extract] upstream', res.status, await res.text());
    return json(502, { error: 'gemini_error' });
  }
  try {
    const data = await res.json();
    const text: unknown = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string') throw new Error('no text part');
    return json(200, { json: JSON.parse(text) });
  } catch (err) {
    console.error('[gemini-extract] bad response', err);
    return json(422, { error: 'bad_response' });
  }
});
```

- [ ] **Step 3:** Create `supabase/functions/gemini-summary/index.ts`:

```ts
// POST { prompt } → { text } — short Bulgarian spend summary. Prompt is built
// client-side from pre-aggregated numbers; server caps its size.
import { getCallerHousehold, json } from '../_shared/auth.ts';

const MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_PROMPT_CHARS = 2000;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const caller = await getCallerHousehold(req);
  if (!caller) return json(401, { error: 'unauthorized' });
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) return json(500, { error: 'not_configured' });

  let body: { prompt?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'bad_request' });
  }
  if (typeof body.prompt !== 'string' || body.prompt.length === 0 || body.prompt.length > MAX_PROMPT_CHARS) {
    return json(400, { error: 'bad_request' });
  }

  const res = await fetch(`${GEMINI_URL}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: body.prompt }] }] }),
  });
  if (res.status === 429) return json(429, { error: 'rate_limited' });
  if (!res.ok) {
    console.error('[gemini-summary] upstream', res.status, await res.text());
    return json(502, { error: 'gemini_error' });
  }
  try {
    const data = await res.json();
    const text: unknown = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string' || text.trim().length === 0) throw new Error('empty');
    return json(200, { text: text.trim() });
  } catch (err) {
    console.error('[gemini-summary] bad response', err);
    return json(422, { error: 'bad_response' });
  }
});
```

- [ ] **Step 4:** Set the secret (value = current `EXPO_PUBLIC_GEMINI_API_KEY` from `.env`; single-line, so the Windows CLI truncation issue doesn't apply):

```powershell
npx supabase secrets set GEMINI_API_KEY=<value-from-.env>
```

- [ ] **Step 5:** Deploy all three touched functions via MCP `mcp__supabase__deploy_edge_function`: `gemini-extract`, `gemini-summary`, and redeploy `bank-sync-start` / `bank-sync-callback` / `bank-sync-transactions` (they now resolve `_shared/eb.ts` → `_shared/auth.ts`; include BOTH shared files in each deploy payload).
- [ ] **Step 6:** Smoke-test `gemini-summary` with a valid user JWT (get one via the app or `supabase.auth.getSession()` in a scratch script): expect `200 { text: … }`. Without a JWT: expect 401.
- [ ] **Step 7:** Commit: `git commit -am "feat(gemini): server-side extract/summary edge functions with structured output"`

---

### Task 10: `services/gemini.ts` becomes a thin client (+ €0 validation)

**Files:**
- Modify: `services/gemini.ts`, `services/gemini.test.ts`

**Interfaces:**
- Consumes: the two Edge Functions from Task 9.
- Produces (public API unchanged for screens): `isGeminiConfigured: boolean`, `extractReceipt(base64Image, mimeType?): Promise<ExtractionResult>`, `generateInsightsSummary(input): Promise<string | null>`, `buildSummaryPrompt` (unchanged), `ReceiptExtraction`/`SummaryInput` types (unchanged). `isRetryableGeminiError` is REPLACED by `isRetryableStatus(status: number): boolean`.

- [ ] **Step 1: Rewrite tests** — `services/gemini.test.ts`. Mock the supabase module and `global.fetch`:

```ts
import { extractReceipt, generateInsightsSummary, isRetryableStatus, buildSummaryPrompt } from './gemini';

jest.mock('@/services/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'jwt' } } }) },
  },
}));

const mockFetch = (status: number, body: unknown) =>
  jest.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });

describe('isRetryableStatus', () => {
  it('retries 429 and 5xx, not 4xx', () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(422)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
  });
});

describe('extractReceipt', () => {
  afterEach(() => jest.restoreAllMocks());

  it('maps a good response to normalized cents', async () => {
    global.fetch = mockFetch(200, {
      json: { merchant: 'Lidl', date: '2026-07-01', total: 12.5, currency: 'EUR', items: [] },
    }) as never;
    const r = await extractReceipt('AAAA');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.totalCents).toBe(1250);
  });

  it('rejects a zero/missing total as extraction failure (review #3)', async () => {
    global.fetch = mockFetch(200, {
      json: { merchant: 'Lidl', date: null, currency: 'EUR', items: [] },
    }) as never;
    const r = await extractReceipt('AAAA');
    expect(r.ok).toBe(false);
  });

  it('does not retry a 422 and falls back', async () => {
    const f = mockFetch(422, { error: 'bad_response' });
    global.fetch = f as never;
    const r = await extractReceipt('AAAA');
    expect(r.ok).toBe(false);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('retries a 503 up to 3 attempts', async () => {
    const f = mockFetch(503, { error: 'gemini_error' });
    global.fetch = f as never;
    const r = await extractReceipt('AAAA');
    expect(r.ok).toBe(false);
    expect(f).toHaveBeenCalledTimes(3);
  });
});

describe('generateInsightsSummary', () => {
  it('returns trimmed text on success', async () => {
    global.fetch = mockFetch(200, { text: 'Кратко обобщение.' }) as never;
    const input = { monthTotalCents: 1000, prevMonthTotalCents: 0, pctChange: null, topCategory: null, topMerchant: null };
    await expect(generateInsightsSummary(input)).resolves.toBe('Кратко обобщение.');
  });
  it('null on over-long text', async () => {
    global.fetch = mockFetch(200, { text: 'x'.repeat(500) }) as never;
    const input = { monthTotalCents: 1000, prevMonthTotalCents: 0, pctChange: null, topCategory: null, topMerchant: null };
    await expect(generateInsightsSummary(input)).resolves.toBeNull();
  });
});
```

Keep any existing `buildSummaryPrompt` tests. NOTE: to make retries fast in tests, the implementation's backoff delay must be skippable — export `const RETRY_BASE_MS = 500` and in the test file do `jest.useFakeTimers` OR simpler: implement `delay` via a module-level injectable. Simplest deterministic approach used here: implementation reads `RETRY_BASE_MS` and the test sets `jest.useFakeTimers({ advanceTimers: true })` in `beforeEach` for the retry test.

- [ ] **Step 2:** `npm test -- gemini` → FAIL.
- [ ] **Step 3: Rewrite `services/gemini.ts`** — keep the file-top comment, `ReceiptLineItem`/`ReceiptExtraction`/`ExtractionResult`/`SummaryInput` interfaces, `toCents`, `normalize`, `buildSummaryPrompt`, `SUMMARY_MAX_CHARS`, and `delay` as-is. Replace configuration + calls:

```ts
import { isSupabaseConfigured, supabase } from '@/services/supabase';
import { formatCurrency } from '@/lib/formatCurrency';

/** Gemini now runs server-side; "configured" = Supabase reachable. */
export const isGeminiConfigured = isSupabaseConfigured;

const FUNCTIONS_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''}/functions/v1`;
const MAX_ATTEMPTS = 3;
export const RETRY_BASE_MS = 500;

/** Transient statuses worth retrying; 4xx (bad request/response) are not. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 504);
}

async function callGeminiFn(name: string, body: unknown): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('not signed in');
  return await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}
```

`extractReceipt` loop body (same retry skeleton as before — attempt loop, backoff `delay(RETRY_BASE_MS * 2 ** (attempt - 1))`):

```ts
    try {
      const res = await callGeminiFn('gemini-extract', { image: base64Image, mimeType });
      if (!res.ok) {
        if (isRetryableStatus(res.status)) continue outer-loop-style; // set lastErr and continue
        break; // 4xx — won't improve on retry
      }
      const { json: raw } = (await res.json()) as { json: unknown };
      const data = normalize(raw);
      // Review #3: a zero/negative total means the model failed — fall back to manual.
      if (data.totalCents <= 0) return { ok: false, reason: 'Could not read the receipt automatically.' };
      if (__DEV__) console.log('[gemini] receipt extraction:', JSON.stringify(raw));
      return { ok: true, data, raw };
    } catch (err) {
      lastErr = err; // network — retry
    }
```

(Express the `continue`/`break` with a stored `lastErr = new Error(\`gemini-extract \${res.status}\`)` and `if (!isRetryableStatus(res.status)) break;` — mirror the existing loop structure.)

`generateInsightsSummary`: same loop; call `callGeminiFn('gemini-summary', { prompt })`; on ok read `{ text }`, apply the existing `SUMMARY_MAX_CHARS`/empty checks, return `text` or `null`. Non-retryable status → return null immediately.

Delete the old `GoogleGenerativeAI` import, `MODEL`, `apiKey`, `EXTRACTION_PROMPT`, and `isRetryableGeminiError`.

- [ ] **Step 4:** `npm test -- gemini` → PASS. `npx tsc --noEmit` → PASS (no screen changes needed — contract preserved).
- [ ] **Step 5:** Remove `@google/generative-ai` from `package.json` (`npm uninstall @google/generative-ai`).
- [ ] **Step 6:** Commit: `git commit -am "feat(gemini): client calls edge functions; api key leaves the bundle; reject empty totals"`

---

### Task 11: Bank-sync truncation flag + client surfacing

**Files:**
- Modify: `supabase/functions/bank-sync-transactions/index.ts`, `services/bank-sync.ts`, `services/bank-sync.test.ts`, `app/import-dsk.tsx`

**Interfaces:**
- Produces: function response gains `truncated: boolean`; `fetchBankTransactions(): Promise<{ transactions: EbTransaction[]; truncated: boolean }>` (was `Promise<EbTransaction[]>`); `getBankConnection` logs errors in dev.

- [ ] **Step 1:** Edge function — replace the final `return`:

```ts
  const truncated = Boolean(continuationKey);
  if (truncated) {
    console.warn('[bank-sync-transactions] MAX_PAGES reached — result truncated');
  }
  return json(200, { transactions, truncated, validUntil: conn.valid_until });
```

Deploy via MCP `deploy_edge_function` (include `_shared/eb.ts` + `_shared/auth.ts`).

- [ ] **Step 2:** `services/bank-sync.ts`:

```ts
export async function fetchBankTransactions(): Promise<{
  transactions: EbTransaction[];
  truncated: boolean;
}> {
  … same status handling …
  const data = (await res.json()) as { transactions?: EbTransaction[]; truncated?: boolean };
  return { transactions: data.transactions ?? [], truncated: data.truncated ?? false };
}
```

In `getBankConnection`, before `return null` on error: `if (error && __DEV__) console.warn('[bank-sync] connection lookup failed', error);`

- [ ] **Step 3:** Update `services/bank-sync.test.ts` call sites for the new return shape; add:

```ts
it('surfaces the truncated flag', async () => {
  // mock fetch → 200 { transactions: [], truncated: true }
  const r = await fetchBankTransactions();
  expect(r.truncated).toBe(true);
});
```

- [ ] **Step 4:** `app/import-dsk.tsx` `syncFromBank`: destructure `const { transactions: ebTxs, truncated } = await fetchBankTransactions();` (both call sites) and stash `truncated` in the preview (`Preview` gains `truncated?: boolean`; the notice UI lands with Task 13's preview rework — for now just store it and `npx tsc` clean).
- [ ] **Step 5:** Tests + tsc → PASS. Commit: `git commit -am "fix(bank-sync): surface truncated page results to the client"`

---

### Task 12: Extract import-dsk screen components (mechanical)

**Files:**
- Create: `features/transactions/components/import/ImportRow.tsx`, `features/transactions/components/import/ImportSummaryView.tsx`
- Modify: `app/import-dsk.tsx`

**Interfaces:**
- Produces:
  - `ImportRow({ row, muted, badge }: { row: NormalizedTransaction; muted?: boolean; badge?: string })` — the current `Row` component (`app/import-dsk.tsx:61-90`) moved verbatim.
  - `ImportSummaryView({ summary }: { summary: { imported: number; duplicates: number; other: number } })` — the post-import summary body (`app/import-dsk.tsx:242-267`, the `<SectionLabel>` + rows block) moved verbatim; the `Screen`/`Header`/`FloatingActionBar` shell stays in the screen.

- [ ] **Step 1:** Create the two components by MOVING the JSX verbatim (imports adjusted: `HairlineDivider`, `SectionLabel`, `formatCurrency`, `NormalizedTransaction` type). No behavior change, no styling change.
- [ ] **Step 2:** Update `app/import-dsk.tsx` to render `<ImportRow …>` / `<ImportSummaryView summary={summary} />`; delete the moved code.
- [ ] **Step 3:** `npx tsc --noEmit` + `npm run lint` → PASS. Commit: `git commit -am "refactor(import): extract ImportRow and ImportSummaryView"`

---

### Task 13: Import screen — importable income, dedupe-at-import, window/truncation notices

**Files:**
- Modify: `app/import-dsk.tsx`

**Interfaces:**
- Consumes: `expensesOnly`/`incomeOnly` (Task 3), `resolveCategoryId(merchant, cats, kind)` (Task 4), nullable normalizers + kind dedup (Task 5), `windowStartISO`/`TRANSACTION_WINDOW_MONTHS` (Task 7), `truncated` (Task 11), `ImportRow` (Task 12).

- [ ] **Step 1: Rework preview building.** New `Preview` shape:

```ts
interface Preview {
  newExpenses: NormalizedTransaction[];
  newIncome: NormalizedTransaction[];
  duplicates: NormalizedTransaction[];
  fileName: string;
  source: 'csv' | 'bank';
  truncated: boolean;      // bank page-limit hit (Task 11)
  outOfWindow: boolean;    // rows older than the fetch window → dedup can't check them
}
```

Shared builder inside the component file:

```ts
function buildPreview(
  rows: NormalizedTransaction[],
  existing: Transaction[],
  fileName: string,
  source: 'csv' | 'bank',
  truncated: boolean,
): Preview {
  const windowStart = windowStartISO(TRANSACTION_WINDOW_MONTHS);
  const { toImport, duplicates } = dedupeImport(rows, existing);
  return {
    newExpenses: expensesOnly(toImport),
    newIncome: incomeOnly(toImport),
    duplicates,
    fileName,
    source,
    truncated,
    outOfWindow: rows.some((r) => r.date < windowStart),
  };
}
```

CSV path: `const rows = parseDskCsv(text).map(normalizeDskRow).filter((r): r is NormalizedTransaction => r !== null);` then `setPreview(buildPreview(rows, transactions, file.name, 'csv', false));` — the old expense/income split-and-skip is deleted. Bank path likewise with `truncated`.

- [ ] **Step 2: Import both kinds + recompute dedupe at import time (review #6).** In `onImport`:

```ts
    const fresh = useTransactionsStore.getState().transactions;
    const candidates = [...preview.newExpenses, ...preview.newIncome];
    const { toImport } = dedupeImport(candidates, fresh); // partner may have inserted since preview
    const rows: ImportedTransaction[] = toImport.map((r) => ({
      householdId,
      userId: session?.user.id ?? null,
      kind: r.kind,
      amountCents: r.amountEurCents,
      originalAmountCents: r.originalAmountCents,
      originalCurrency: r.originalCurrency,
      merchant: r.merchant,
      categoryId: resolveCategoryId(r.merchant, categories, r.kind),
      date: r.date,
      occurredAt: r.occurredAt,
      note: null,
    }));
```

Summary: `imported: toImport.length`, `duplicates: preview.duplicates.length + (candidates.length - toImport.length)`, `other: toImport.filter((r) => r.kind === 'expense' && r.categoryGuess === 'Other').length`.

- [ ] **Step 3: Render.** Sections (reusing `ImportRow`):
  - `Нови разходи (N)` — `newExpenses`
  - `Приходи (N)` — `newIncome`, each row with `badge="приход"` (NOT muted — they now import)
  - `Дубликати (N)` — muted + badge as before
  - Import button label: total = `newExpenses.length + newIncome.length`; `nothing` when 0.
  - Notices above the sections, plain `<Text className="mb-md font-inter text-body-md text-tertiary">`:
    - when `preview.outOfWindow`: `Файлът съдържа редове отпреди {TRANSACTION_WINDOW_MONTHS} месеца — те не се проверяват за дубликати.`
    - when `preview.truncated`: `Банката върна непълен резултат — синхронизирай пак за останалите.`
- [ ] **Step 4:** `npx tsc --noEmit` + `npm test` → PASS. Manually sanity-check a CSV import in the dev app if available.
- [ ] **Step 5:** Commit: `git commit -am "feat(income): income rows importable; dedupe recomputed at import; window/truncation notices"`

---

### Task 14: View-layer income basics — history rows, dashboard math, detail screen

**Files:**
- Modify: `features/transactions/groupByDay.ts`, `features/transactions/groupByDay.test.ts`, `app/(app)/index.tsx`, `app/transaction/[id].tsx`

**Interfaces:**
- Consumes: `Transaction.kind` (Task 3), `expensesOnly` (Task 3).
- Produces: `toTransactionView` sets `isIncome: tx.kind === 'income'` (consumed by the already-built `TransactionRow` + sign rendering).

- [ ] **Step 1: Failing test** — `groupByDay.test.ts`:

```ts
it('maps kind income → isIncome view flag', () => {
  const view = toTransactionView(tx({ kind: 'income' }), new Map());
  expect(view.isIncome).toBe(true);
  expect(toTransactionView(tx({ kind: 'expense' }), new Map()).isIncome).toBe(false);
});
```

- [ ] **Step 2:** Run → FAIL. Implement in `toTransactionView` (replace the `// isIncome deferred` comment):

```ts
    isIncome: tx.kind === 'income',
```

- [ ] **Step 3: Dashboard** (`app/(app)/index.tsx`) — money math over expenses only; recent list keeps all kinds:

```ts
  const expenseTxs = useMemo(() => expensesOnly(transactions), [transactions]);
  const filtered = useMemo(
    () => filterByUser(expenseTxs, scope === 'me' ? userId : null),
    [expenseTxs, scope, userId],
  );
  const recentPool = useMemo(
    () => filterByUser(transactions, scope === 'me' ? userId : null),
    [transactions, scope, userId],
  );
```

`recent` maps over `recentPool.slice(0, 3)`; `householdCategoryRows` uses `spendingByCategory(expenseTxs, categories)`. Everything else unchanged.

- [ ] **Step 4: Detail screen** (`app/transaction/[id].tsx`) hero amount:

```tsx
            <Text
              className={`font-jakarta-semibold ${tx.kind === 'income' ? 'text-primary' : 'text-on-surface'}`}
              style={{ fontSize: 56, lineHeight: 64 }}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}>
              {tx.kind === 'income' ? '+' : ''}
              {formatCurrency(tx.amount_eur)}
            </Text>
```

- [ ] **Step 5:** Tests + tsc → PASS. Commit: `git commit -am "feat(income): income rows in history/detail; dashboard math is expense-only"`

---

### Task 15: Manual entry — Разход/Приход toggle

**Files:**
- Modify: `features/transactions/edit.ts`, `features/transactions/edit.test.ts`, `app/manual-entry.tsx`

**Interfaces:**
- Consumes: `TxKind`, `expenseCategories`/`incomeCategories` (Task 3), `resolveCategoryId(…, kind)` (Task 4), `guessIncomeCategory` (Task 4).
- Produces: `ManualEntryFormValues.kind: TxKind`; `transactionToFormValues` maps `kind: tx.kind`.

- [ ] **Step 1: Failing test** — `edit.test.ts`: extend the existing `transactionToFormValues` expectation with `kind` (fixture gets `kind: 'income'`, expect `kind: 'income'` in the result).
- [ ] **Step 2:** Run → FAIL. Implement: add `kind: 'expense' | 'income';` to `ManualEntryFormValues` and `kind: tx.kind,` to `transactionToFormValues`. Run → PASS.
- [ ] **Step 3: Screen** (`app/manual-entry.tsx`):
  - State: `const [kind, setKind] = useState<TxKind>(seed?.kind ?? 'expense');`
  - Toggle handler resets an incompatible category selection:

```ts
  const onKindChange = (next: TxKind) => {
    setKind(next);
    const selected = categoryId ? categories.find((c) => c.id === categoryId) : undefined;
    if (selected && selected.kind !== next) {
      setCategoryId(null);
      setCategoryTouched(false);
    }
  };
```

  - UI: directly above the Amount block insert:

```tsx
          <View className="mb-md mt-6 items-center">
            <SegmentedToggle<TxKind>
              value={kind}
              onChange={onKindChange}
              options={[
                { value: 'expense', label: 'Разход' },
                { value: 'income', label: 'Приход' },
              ]}
            />
          </View>
```

(reduce the Amount block's `mt-12` to `mt-4` so vertical rhythm holds; import `SegmentedToggle`.)
  - Category label logic:

```ts
  const categoryLabel = selectedCategory
    ? selectedCategory.name
    : kind === 'income'
      ? merchant.trim() && !categoryTouched
        ? guessIncomeCategory(merchant)
        : 'Друг приход'
      : merchant.trim() && !categoryTouched
        ? guessCategory(merchant)
        : 'Автоматично';
```

  - Picker gets the kind-filtered list: `categories={kind === 'income' ? incomeCategories(categories) : expenseCategories(categories)}`.
  - Save: `resolvedCategoryId = categoryTouched ? categoryId : resolveCategoryId(parsed.data.merchant, categories, kind);` `createTransaction`/`updateTransaction` receive `kind`. After save, guard side-effects:

```ts
      if (createdId !== null && kind === 'expense') {
        await runDetection({ … });
        await runBudgetCheck({ … });
      }
```

- [ ] **Step 4:** tsc + lint + full `npm test` → PASS. Commit: `git commit -am "feat(income): expense/income toggle in manual entry"`

---

### Task 16: Extract insights screen components (mechanical)

**Files:**
- Create in `features/insights/components/`: `AiSummaryCard.tsx`, `CategoryBreakdownList.tsx`, `MonthlyTrendBars.tsx`, `TopMerchantsList.tsx`, `BudgetSection.tsx`, `AnomalyCards.tsx`, `MonthPickerSheet.tsx`
- Modify: `app/(app)/insights.tsx`

**Interfaces (props — JSX bodies move verbatim from `app/(app)/insights.tsx`, source lines noted):**

```ts
AiSummaryCard        { status: SummaryStatus; text: string | null }                       // lines 279-296
CategoryBreakdownList{ rows: CategorySpend[] }                                            // lines 301-336
MonthlyTrendBars     { trend: TrendMonth[] }                                              // lines 341-356
TopMerchantsList     { merchants: MerchantSpend[] }                                       // lines 361-387
BudgetSection        { rows: BudgetProgress[]; categoryById: Map<string, CategoryLite> }  // lines 392-449
AnomalyCards         { cards: Array<{ id: string; transactionId: string; merchant: string; amountCents: number; reason: string }>; onReview: (anomalyId: string, transactionId: string) => void }  // lines 451-500
MonthPickerSheet     { visible: boolean; options: MonthOption[]; onPick: (opt: MonthOption) => void; onClose: () => void }  // lines 504-518 (includes the BottomSheet wrapper)
```

- [ ] **Step 1:** Create each component: move the referenced JSX verbatim, moving only the imports each needs (`MaterialIcons`, `SectionLabel`, `HairlineDivider`, `Skeleton`, `formatCurrency`, `BottomSheet`, types). Each component includes its own leading `SectionLabel`/`HairlineDivider` exactly as in the source so the screen render order is a flat list of components.
- [ ] **Step 2:** Rewrite the screen's return body to compose them; delete moved code. All hooks/state/`useMemo`s stay in the screen.
- [ ] **Step 3:** tsc + lint + visual check in dev app (screen must be pixel-identical). Commit: `git commit -am "refactor(insights): split screen into feature components"`

---

### Task 17: Insights — expense-only math, income line, fresh `now`

**Files:**
- Modify: `app/(app)/insights.tsx`

**Interfaces:**
- Consumes: `expensesOnly`/`incomeOnly` (Task 3), `sumCents`, `filterByRange`, `filterByUser`, `useFocusEffect` from `expo-router`.

- [ ] **Step 1:** Fresh `now` (review #11) — replace `const now = useMemo(() => new Date(), []);` with:

```ts
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(useCallback(() => setNow(new Date()), []));
```

and in `onRefresh` add `setNow(new Date());` first. (`monthOptions` keeps `useMemo(…, [now])`.)

- [ ] **Step 2:** Expense-only spend math + income total:

```ts
  const expenseTxs = useMemo(() => expensesOnly(transactions), [transactions]);
  const personFiltered = useMemo(
    () => filterByUser(expenseTxs, scope === 'me' ? userId : null),
    [expenseTxs, scope, userId],
  );
  const incomeRangeTotal = useMemo(
    () =>
      sumCents(
        filterByRange(
          filterByUser(incomeOnly(transactions), scope === 'me' ? userId : null),
          range,
          now,
        ),
      ),
    [transactions, scope, userId, range, now],
  );
```

`currentMonthHouseholdSpend` uses `spendingByCategory(expenseTxs, categories)`. The summary effect and `onRefresh` pass `expensesOnly(...)` / `expensesOnly(s.transactions)` to `refreshSummary`.

- [ ] **Step 3:** Income line under the hero `Comparison`:

```tsx
            {incomeRangeTotal > 0 ? (
              <Text className="font-inter-semibold text-body-md text-tertiary">
                Приходи: +{formatCurrency(incomeRangeTotal)}
              </Text>
            ) : null}
```

- [ ] **Step 4:** `showEmpty` should key off ALL transactions (unchanged) — verify. tsc + lint + `npm test` → PASS. Commit: `git commit -am "feat(income): insights expense-only math, income total line, focus-fresh now"`

---

### Task 18: Expense-only budgets, AI summary input, reports (+ income row in PDF)

**Files:**
- Modify: `features/budgets/runBudgetCheck.ts`, `features/budgets/runBudgetCheck.test.ts`, `app/budgets.tsx`, `features/insights/summaryInput.ts` (doc comment only), `features/reports/reportData.ts`, `features/reports/reportData.test.ts`, `features/reports/types.ts`, `features/reports/reportHtml.ts`

**Interfaces:**
- Produces: `ReportData.incomeTotalCents: number`.

- [ ] **Step 1: Failing tests.**

`runBudgetCheck.test.ts` — add a mixed-kind fixture case: an income transaction in the saved category must NOT count toward the budget threshold (copy an existing over-threshold case, flip the pushing transaction to `kind: 'income'`, assert `notify` NOT called).

`reportData.test.ts`:

```ts
it('income is excluded from spend sections and reported as incomeTotalCents', () => {
  // fixture: one expense 1000, one income 5000 in the report month
  const data = buildReportData(input);
  expect(data.totalCents).toBe(1000);
  expect(data.incomeTotalCents).toBe(5000);
  expect(data.merchants.every((m) => m.merchant !== incomeMerchantName)).toBe(true);
});
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.**
  - `runBudgetCheck.ts`: `const spend = spendingByCategory(expensesOnly(input.transactions), input.categories, now);`
  - `app/budgets.tsx`: `const allCategories = useTransactionsStore((s) => s.categories);` `const categories = useMemo(() => expenseCategories(allCategories), [allCategories]);`
  - `summaryInput.ts`: extend the doc comment: `Pass expense-only transactions (use expensesOnly) — income must not inflate the spend summary.` (Callers already filter per Task 17.)
  - `reportData.ts`: after `monthTxs`, split: `const expenseMonthTxs = expensesOnly(monthTxs);` — use `expenseMonthTxs` for `totalCents`, `catRows`, `merchants`, `spend`, `anomalies` mapping; prev-month total uses `expensesOnly(...)` of the bounded set; `trend` uses `monthlyTrend(expensesOnly(input.transactions), 6, month)`. Add `incomeTotalCents: sumCents(incomeOnly(monthTxs))` to the returned object; add the field to `ReportData` in `types.ts`.
  - `reportHtml.ts`: after `${pctLine(data.pctVsPrevMonth)}` in the template body insert `${incomeLine}` where:

```ts
  const incomeLine =
    data.incomeTotalCents > 0
      ? `<div class="pct" style="color:#ffdfa7">Приходи: +${formatCurrency(data.incomeTotalCents)}</div>`
      : '';
```

- [ ] **Step 4:** All tests + tsc → PASS. Commit: `git commit -am "feat(income): budgets/summary/reports are expense-only; PDF income row"`

---

### Task 19: Categories screen — kind sections + kind on create

**Files:**
- Modify: `app/categories.tsx`

**Interfaces:**
- Consumes: `expenseCategories`/`incomeCategories` (Task 3), `createCategory({ …, kind })` (Task 3).

- [ ] **Step 1:** Draft gains kind: `type Draft = { id: string | null; name: string; icon: MaterialIconName; color: string; kind: 'expense' | 'income' };` `emptyDraft` gets `kind: 'expense'`; `openEdit` maps `kind: c.kind`. `onSave` passes `kind: draft.kind` to `createCategory` (existing `updateCategory` does NOT change kind — reclassifying a used category would silently rewrite history).
- [ ] **Step 2:** Render two sections instead of one flat list — extract the row markup (lines 96-119) into a local `CategoryRow` and render:

```tsx
      <SectionLabel className="mb-sm">Разходи</SectionLabel>
      {expenseList.map((c) => <CategoryRow key={c.id} c={c} />)}
      <SectionLabel className="mb-sm mt-lg">Приходи</SectionLabel>
      {incomeList.map((c) => <CategoryRow key={c.id} c={c} />)}
```

with `const expenseList = useMemo(() => expenseCategories(categories), [categories]);` (same for income).

- [ ] **Step 3:** Add/edit sheet: below the name input add a kind toggle, disabled when editing:

```tsx
            {draft.id === null ? (
              <View className="items-start">
                <SegmentedToggle<'expense' | 'income'>
                  value={draft.kind}
                  onChange={(kind) => setDraft({ ...draft, kind })}
                  options={[
                    { value: 'expense', label: 'Разход' },
                    { value: 'income', label: 'Приход' },
                  ]}
                />
              </View>
            ) : null}
```

Add `'payments'`, `'account-balance-wallet'`, `'trending-up'` to `ICON_CHOICES`.

- [ ] **Step 4:** tsc + lint + manual check. Commit: `git commit -am "feat(income): category management with expense/income sections"`

---

### Task 20: Keyboard handling — react-native-keyboard-controller

**Files:**
- Modify: `package.json` (new dep), `app/_layout.tsx`, `components/Screen.tsx`, `components/AuthShell.tsx`, `app/manual-entry.tsx`, `app/confirm-receipt.tsx`, possibly `jest.config.js`

- [ ] **Step 1:** `npx expo install react-native-keyboard-controller`
- [ ] **Step 2:** `app/_layout.tsx` — wrap inside `GestureHandlerRootView`:

```tsx
import { KeyboardProvider } from 'react-native-keyboard-controller';
…
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <StatusBar style="light" />
        {status === 'error' ? … : <Stack …>…</Stack>}
        <OfflineBanner />
      </KeyboardProvider>
    </GestureHandlerRootView>
```

- [ ] **Step 3:** `components/Screen.tsx` — replace `ScrollView` with the library's aware scroll (props are a superset of ScrollView's):

```tsx
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
…
          <KeyboardAwareScrollView
            className="flex-1"
            bottomOffset={24}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomPad }}
            contentContainerClassName={contentClassName}
            showsVerticalScrollIndicator={false}
            refreshControl={…unchanged…}>
            {children}
          </KeyboardAwareScrollView>
```

(NativeWind `className` on third-party components is a no-op per project memory — keep `className` only where it already worked on ScrollView via cssInterop, otherwise use `style={{ flex: 1 }}`; verify visually.)

- [ ] **Step 4:** `app/manual-entry.tsx` + `app/confirm-receipt.tsx`: swap their `ScrollView` for `KeyboardAwareScrollView` with `bottomOffset={140}` (clears the floating action bar), keeping `keyboardShouldPersistTaps="handled"` and existing `contentContainerStyle`.
- [ ] **Step 5:** `components/AuthShell.tsx`: replace RN's `KeyboardAvoidingView` with the library's:

```tsx
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
…
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
```

(no Platform fork — the library implements `padding` correctly on Android too).

- [ ] **Step 6:** `npm test` — if jest fails resolving the native module, add `react-native-keyboard-controller` to the `transformIgnorePatterns` whitelist in `jest.config.js` and, if a component under test imports it, mock via its documented mock: `jest.mock('react-native-keyboard-controller', () => require('react-native-keyboard-controller/jest'));` in `jest.setup.ts`.
- [ ] **Step 7:** tsc + lint + tests → PASS. Commit: `git commit -am "feat(ux): keyboard-aware scrolling via react-native-keyboard-controller"`
  **Note:** the running dev client will show a native-module error until rebuilt — expected; flagged to the owner in Task 22.

---

### Task 21: Extract profile screen components (mechanical)

**Files:**
- Create: `features/household/components/ProfileHeader.tsx`, `features/household/components/MembersSection.tsx`, `features/preferences/components/PreferenceToggles.tsx`, `features/preferences/components/LayoutSheet.tsx`, `features/transactions/components/BankConnectionSection.tsx`
- Modify: `app/(app)/profile.tsx`

**Interfaces (JSX moves verbatim from `app/(app)/profile.tsx`, source lines noted):**

```ts
ProfileHeader        { displayName: string; email: string; onSaveName: (name: string) => Promise<void> }
                     // lines 137-170 + the edit BottomSheet lines 234-258; owns editOpen/nameDraft/savingName state
MembersSection       { members: HouseholdMember[]; inviteCode: string; onInvite: () => void }   // lines 172-218
LayoutSheet          { visible: boolean; sections: UserPreferences['dashboardSections']; onChange: (next: UserPreferences['dashboardSections']) => Promise<void>; onClose: () => void }  // lines 260-275
PreferenceToggles    { budgetAlerts: boolean; anomalyAlerts: boolean; onBudgetAlertsChange: (v: boolean) => void; onAnomalyAlertsChange: (v: boolean) => void }  // lines 319-355 (Известия section incl. the budgets link row)
BankConnectionSection{ lastSyncLabel: string | null }                                            // lines 291-317
```

- [ ] **Step 1:** Create the five components (move JSX + needed imports; `ProfileHeader` keeps the name-saving UX: on save it awaits `onSaveName(name)` and closes; error Alert stays inside). `onSaveName` in the screen wraps the current `updateMyDisplayName`/`setHousehold`/`getMembers` logic.
- [ ] **Step 2:** Screen becomes composition: header text, `ProfileHeader`, `MembersSection`, the Начало section (small — stays), `LayoutSheet`, `PreferenceToggles`, `BankConnectionSection`, Валута/Език pills, General section, version footer.
- [ ] **Step 3:** tsc + lint + visual check. Commit: `git commit -am "refactor(profile): split screen into feature components"`

---

### Task 22: Docs, final verification, rollout notes

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `.env` (owner step), memory files (per memory instructions)

- [ ] **Step 1:** `CLAUDE.md`:
  - DB table doc: `transactions … kind ('expense'|'income')`, `categories … kind`.
  - Stack table: add `Keyboard | react-native-keyboard-controller (KeyboardProvider in root layout)`.
  - Rule 5 note: Gemini calls now run in `supabase/functions/gemini-*`; `services/gemini.ts` is the client seam.
- [ ] **Step 2:** `README.md`: env vars — `EXPO_PUBLIC_GEMINI_API_KEY` no longer used by the app (server secret `GEMINI_API_KEY` instead); note the dev-client rebuild requirement.
- [ ] **Step 3:** Full gate: `npx tsc --noEmit` && `npm run lint` && `npm test` — all green. Fix anything that isn't.
- [ ] **Step 4:** Run the app (`npx expo start`) and manually verify: manual income entry appears with `+` in history and does not change dashboard spend; CSV import preview shows the income section; insights shows the Приходи line; keyboard behavior (NOTE: needs the rebuilt dev client).
- [ ] **Step 5:** Commit docs: `git commit -am "docs: income model, keyboard stack, server-side gemini"`
- [ ] **Step 6 (owner actions — report, don't do):**
  1. Rebuild the dev client: `eas build --profile preview --platform android` (native dep added).
  2. After verifying receipt scanning works on the new build, delete `EXPO_PUBLIC_GEMINI_API_KEY` from `.env`.

---

## Self-review notes (already applied)

- Review-doc item #6 (dedupe recompute at import time) is implemented in Task 13 — the spec's §4.5 numbering drifted (its "#6" is the accounts[0] comment, delivered in Task 9 Step 1); both are covered.
- Type/signature consistency: `TxKind` defined once (Task 3) and imported everywhere; `importKey(kind, date, cents, merchant)` used identically in Tasks 5/13; `windowStartISO` consumed in Tasks 7/13; `fetchBankTransactions` new return shape consumed in Task 13.
- Every spec section maps to a task: §2.2→T2, §2.3→T3, §2.4→T4, §2.5→T13/14/15/17/18/19, §2.6→T5, §3→T20, §4.1→T9/10, §4.2→T8, §4.3→T7, §4.4→T12/16/21, §4.5→T1/5/6/9/11/13/17, §5→per-task tests, §6→T22.

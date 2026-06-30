# Day 14 — AI Spend Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a cached, pull-to-refresh, 2-3 sentence Gemini summary of the household's current-month spending at the top of Insights, hidden silently on failure.

**Architecture:** A pure `buildSummaryInput` turns current-month household data into a compact `SummaryInput`; `services/gemini.ts` owns the `SummaryInput` type, a pure `buildSummaryPrompt`, and `generateInsightsSummary` (gemini-2.5-flash + the existing retry, returns plain text or null). A tiny Zustand `summaryStore` is the session cache; `refreshSummary` orchestrates input→generate→store. The Insights screen renders loading/ready/hidden and triggers generation on first view + pull-to-refresh.

**Tech Stack:** React Native + Expo, TypeScript strict, `@google/generative-ai`, Zustand, Jest (`jest-expo`).

## Global Constraints

- **Money = integer EUR cents**; all display via `formatCurrency`. The prompt sends pre-formatted amounts so Gemini never does arithmetic.
- **All Gemini calls live in `/services/gemini.ts`** (CLAUDE.md chokepoint rule).
- **Fixed scope: current-month, household** — the summary ignores the Insights range pills and the Аз/Домакинство toggle.
- **Session cache (in-memory Zustand), manual refresh only** — generate once per session on first Insights view; regenerate only on pull-to-refresh; never on tab switch / new transaction / toggle change.
- **Hide on failure or no data** — the whole AI-summary block renders nothing; no error UI, never crash.
- **Model `gemini-2.5-flash`** via the existing `isRetryableGeminiError` retry loop; best-effort (`generateInsightsSummary` returns `null`, never throws to the UI).
- **Plain-text Bulgarian** output (no JSON, no markdown). UI copy Bulgarian.
- TypeScript strict; no `any`; no plain `.js`.
- **Conventional commits**; every commit ends with the trailer below.
- Verify: `npm test`, `npx tsc --noEmit`, `npm run lint`. The `env: load .env` header from lint/test is normal.

Commit trailer for every commit:
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## File Structure

- `services/gemini.ts` — **modify**: add `SummaryInput` type, `buildSummaryPrompt`, `generateInsightsSummary` (reuses `MODEL`, `delay`, `MAX_ATTEMPTS`, `isRetryableGeminiError`).
- `services/gemini.test.ts` — **modify**: tests for `buildSummaryPrompt`.
- `features/insights/summaryInput.ts` (+ `.test.ts`) — **create**: `buildSummaryInput`.
- `features/insights/summaryStore.ts` — **create**: Zustand session cache.
- `features/insights/summary.ts` (+ `.test.ts`) — **create**: `refreshSummary` orchestrator.
- `app/(app)/insights.tsx` — **modify**: render summary states + first-gen trigger + pull-to-refresh.
- `teftera-build-plan.md` — **modify**: check off Day 14.

---

## Task 1: Gemini summary prompt + call

**Files:**
- Modify: `services/gemini.ts`
- Test: `services/gemini.test.ts`

**Interfaces:**
- Consumes: `formatCurrency` from `@/lib/formatCurrency`; existing `MODEL`, `apiKey`, `isGeminiConfigured`, `delay`, `MAX_ATTEMPTS`, `isRetryableGeminiError`, `GoogleGenerativeAI`.
- Produces:
  - `interface SummaryInput { monthTotalCents: number; prevMonthTotalCents: number; pctChange: number | null; topCategory: { name: string; totalCents: number } | null; topMerchant: { merchant: string; totalCents: number } | null }`
  - `buildSummaryPrompt(input: SummaryInput): string`
  - `generateInsightsSummary(input: SummaryInput): Promise<string | null>`

- [ ] **Step 1: Write the failing test**

In `services/gemini.test.ts`, add `buildSummaryPrompt` and the `SummaryInput` type to the existing `./gemini` import, then append:
```ts
describe('buildSummaryPrompt', () => {
  const full: SummaryInput = {
    monthTotalCents: 82000,
    prevMonthTotalCents: 73000,
    pctChange: 12,
    topCategory: { name: 'Хранене', totalCents: 31000 },
    topMerchant: { merchant: 'Kaufland', totalCents: 14000 },
  };

  it('includes the formatted total, MoM line, top category and merchant', () => {
    const p = buildSummaryPrompt(full);
    expect(p).toContain('Общо този месец: €820,00');
    expect(p).toContain('€730,00 (с 12% повече)');
    expect(p).toContain('Хранене (€310,00)');
    expect(p).toContain('Kaufland (€140,00)');
  });

  it('uses "по-малко" when spending dropped', () => {
    expect(buildSummaryPrompt({ ...full, pctChange: -8 })).toContain('(с 8% по-малко)');
  });

  it('omits optional lines when their inputs are null', () => {
    const p = buildSummaryPrompt({
      monthTotalCents: 5000,
      prevMonthTotalCents: 0,
      pctChange: null,
      topCategory: null,
      topMerchant: null,
    });
    expect(p).toContain('Общо този месец: €50,00');
    expect(p).not.toContain('Миналия месец');
    expect(p).not.toContain('Най-голяма категория');
    expect(p).not.toContain('Топ търговец');
  });
});
```
The existing import line `import { isRetryableGeminiError } from './gemini';` becomes:
```ts
import { buildSummaryPrompt, isRetryableGeminiError, type SummaryInput } from './gemini';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest services/gemini.test.ts -t buildSummaryPrompt`
Expected: FAIL — `buildSummaryPrompt` not exported.

- [ ] **Step 3: Implement**

In `services/gemini.ts`, add near the other interfaces (after `ExtractionResult`):
```ts
/** Compact current-month spend snapshot fed to the summary prompt. Amounts are integer EUR cents. */
export interface SummaryInput {
  monthTotalCents: number;
  prevMonthTotalCents: number;
  pctChange: number | null;
  topCategory: { name: string; totalCents: number } | null;
  topMerchant: { merchant: string; totalCents: number } | null;
}
```
Add an import at the top (with the other imports):
```ts
import { formatCurrency } from '@/lib/formatCurrency';
```
Add at the end of the file:
```ts
const SUMMARY_MAX_CHARS = 400;

/** Build the Bulgarian summary prompt from pre-aggregated current-month data. */
export function buildSummaryPrompt(input: SummaryInput): string {
  const lines = [`Общо този месец: ${formatCurrency(input.monthTotalCents)}`];
  if (input.pctChange !== null) {
    const dir = input.pctChange >= 0 ? 'повече' : 'по-малко';
    lines.push(
      `Миналия месец: ${formatCurrency(input.prevMonthTotalCents)} (с ${Math.abs(input.pctChange)}% ${dir})`,
    );
  }
  if (input.topCategory) {
    lines.push(`Най-голяма категория: ${input.topCategory.name} (${formatCurrency(input.topCategory.totalCents)})`);
  }
  if (input.topMerchant) {
    lines.push(`Топ търговец: ${input.topMerchant.merchant} (${formatCurrency(input.topMerchant.totalCents)})`);
  }
  return [
    'Ти си финансов асистент. На база данните по-долу за текущия месец напиши кратко',
    'обобщение от 2-3 изречения на български. Само обикновен текст, без markdown.',
    '',
    ...lines,
  ].join('\n');
}

/**
 * Generate a short natural-language spend summary. Returns plain Bulgarian text,
 * or `null` when not configured, on any error, or when the response is empty or
 * suspiciously long. Best-effort — never throws; retries transient failures.
 */
export async function generateInsightsSummary(input: SummaryInput): Promise<string | null> {
  if (!isGeminiConfigured) return null;

  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({ model: MODEL });
  const prompt = buildSummaryPrompt(input);
  let lastErr: unknown = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await delay(500 * 2 ** (attempt - 1));
    try {
      const response = await model.generateContent(prompt);
      const text = response.response.text().trim();
      if (text.length === 0 || text.length > SUMMARY_MAX_CHARS) return null;
      if (__DEV__) console.log('[gemini] insights summary:', text);
      return text;
    } catch (err) {
      lastErr = err;
      if (!isRetryableGeminiError(err)) break;
      if (__DEV__) {
        console.warn(`[gemini] summary attempt ${attempt + 1}/${MAX_ATTEMPTS} transient failure, retrying`);
      }
    }
  }
  if (__DEV__) console.warn('[gemini] summary failed, hiding card:', lastErr);
  return null;
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `npx jest services/gemini.test.ts && npx tsc --noEmit`
Expected: PASS — `buildSummaryPrompt` tests (and the existing `isRetryableGeminiError` tests) green; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add services/gemini.ts services/gemini.test.ts
git commit -m "$(cat <<'EOF'
feat(gemini): insights summary prompt + generateInsightsSummary

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Build the summary input (`features/insights/summaryInput.ts`)

**Files:**
- Create: `features/insights/summaryInput.ts`
- Test: `features/insights/summaryInput.test.ts`

**Interfaces:**
- Consumes: `SummaryInput` from `@/services/gemini`; `categoryBreakdown`, `pctChange` from `@/features/transactions/dashboard`; `sumCents`, `topMerchants` from `./aggregate`; `comparisonRange`, `filterByDateBounds`, `filterByRange` from `./range`; `CategoryLite` from `@/features/transactions/groupByDay`; `Transaction` from `@/features/transactions/types`.
- Produces: `buildSummaryInput(txs: Transaction[], categories: CategoryLite[], now?: Date): SummaryInput`. Caller passes the already household-filtered transactions.

- [ ] **Step 1: Write the failing test**

Create `features/insights/summaryInput.test.ts`:
```ts
import type { CategoryLite } from '@/features/transactions/groupByDay';
import type { Transaction } from '@/features/transactions/types';
import { buildSummaryInput } from './summaryInput';

const NOW = new Date(2026, 5, 15); // Jun 2026
const cats: CategoryLite[] = [
  { id: 'c1', name: 'Groceries', icon: 'shopping-basket', color: '#adc7ff' },
  { id: 'c2', name: 'Beverages', icon: 'local-cafe', color: '#d8e3ff' },
];

function tx(p: Partial<Transaction> & { id: string }): Transaction {
  return {
    household_id: 'h', user_id: 'u', amount_eur: 1000,
    original_amount: null, original_currency: null, merchant: 'M',
    category_id: 'c1', date: '2026-06-10', note: null, source: 'manual',
    receipt_id: null, is_flagged: false, occurred_at: null,
    created_at: '2026-06-10T00:00:00.000Z', ...p,
  };
}

describe('buildSummaryInput', () => {
  it('computes totals, pct, top category and top merchant for the current month', () => {
    const r = buildSummaryInput(
      [
        tx({ id: '1', date: '2026-06-02', amount_eur: 3000, category_id: 'c1', merchant: 'Kaufland' }),
        tx({ id: '2', date: '2026-06-09', amount_eur: 1000, category_id: 'c2', merchant: 'Starbucks' }),
        tx({ id: '3', date: '2026-05-20', amount_eur: 2000, category_id: 'c1', merchant: 'Kaufland' }), // last month
      ],
      cats,
      NOW,
    );
    expect(r.monthTotalCents).toBe(4000);
    expect(r.prevMonthTotalCents).toBe(2000);
    expect(r.pctChange).toBe(100);
    expect(r.topCategory).toEqual({ name: 'Groceries', totalCents: 3000 });
    expect(r.topMerchant).toEqual({ merchant: 'Kaufland', totalCents: 3000 });
  });

  it('returns null pct and null top fields when there is no spend', () => {
    const r = buildSummaryInput([tx({ id: 'x', date: '2026-04-01' })], cats, NOW);
    expect(r.monthTotalCents).toBe(0);
    expect(r.prevMonthTotalCents).toBe(0);
    expect(r.pctChange).toBeNull();
    expect(r.topCategory).toBeNull();
    expect(r.topMerchant).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest features/insights/summaryInput.test.ts`
Expected: FAIL — cannot find module `./summaryInput`.

- [ ] **Step 3: Implement**

Create `features/insights/summaryInput.ts`:
```ts
import type { SummaryInput } from '@/services/gemini';
import { categoryBreakdown, pctChange } from '@/features/transactions/dashboard';
import type { CategoryLite } from '@/features/transactions/groupByDay';
import type { Transaction } from '@/features/transactions/types';
import { sumCents, topMerchants } from './aggregate';
import { comparisonRange, filterByDateBounds, filterByRange } from './range';

/**
 * Build the compact current-month snapshot for the AI summary. Pass the already
 * household-scoped transactions; this fixes the window to the current calendar month.
 */
export function buildSummaryInput(
  txs: Transaction[],
  categories: CategoryLite[],
  now: Date = new Date(),
): SummaryInput {
  const monthTxs = filterByRange(txs, 'this_month', now);
  const c = comparisonRange('this_month', now);
  const prevTxs = filterByDateBounds(txs, c.startISO, c.endISO);

  const monthTotalCents = sumCents(monthTxs);
  const prevMonthTotalCents = sumCents(prevTxs);

  const top = categoryBreakdown(monthTxs, categories)[0];
  const merch = topMerchants(monthTxs, 1)[0];

  return {
    monthTotalCents,
    prevMonthTotalCents,
    pctChange: pctChange(monthTotalCents, prevMonthTotalCents),
    topCategory: top ? { name: top.name, totalCents: top.totalCents } : null,
    topMerchant: merch ? { merchant: merch.merchant, totalCents: merch.totalCents } : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest features/insights/summaryInput.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/insights/summaryInput.ts features/insights/summaryInput.test.ts
git commit -m "$(cat <<'EOF'
feat(insights): buildSummaryInput current-month snapshot

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Summary session-cache store (`features/insights/summaryStore.ts`)

**Files:**
- Create: `features/insights/summaryStore.ts`

**Interfaces:**
- Produces: `useSummaryStore` with `{ status: 'idle' | 'loading' | 'ready' | 'error'; text: string | null; setLoading(); setReady(text: string); setError(); reset() }`.

> No unit test: a Zustand container (mirrors `transactions/store.ts`, untested). Gate is `tsc`.

- [ ] **Step 1: Implement**

Create `features/insights/summaryStore.ts`:
```ts
import { create } from 'zustand';

export type SummaryStatus = 'idle' | 'loading' | 'ready' | 'error';

interface SummaryState {
  status: SummaryStatus;
  text: string | null;
  setLoading: () => void;
  setReady: (text: string) => void;
  setError: () => void;
  reset: () => void;
}

/** Session-only cache for the AI spend summary (cleared on app restart). */
export const useSummaryStore = create<SummaryState>((set) => ({
  status: 'idle',
  text: null,
  setLoading: () => set({ status: 'loading' }),
  setReady: (text) => set({ status: 'ready', text }),
  setError: () => set({ status: 'error', text: null }),
  reset: () => set({ status: 'idle', text: null }),
}));
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add features/insights/summaryStore.ts
git commit -m "$(cat <<'EOF'
feat(insights): session-cache store for the AI summary

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Refresh orchestrator (`features/insights/summary.ts`)

**Files:**
- Create: `features/insights/summary.ts`
- Test: `features/insights/summary.test.ts`

**Interfaces:**
- Consumes: `generateInsightsSummary` from `@/services/gemini`; `buildSummaryInput` from `./summaryInput`; `useSummaryStore` from `./summaryStore`; `CategoryLite`, `Transaction` types.
- Produces:
  - `interface RefreshSummaryDeps { generate: typeof generateInsightsSummary; setLoading: () => void; setReady: (text: string) => void; setError: () => void }`
  - `refreshSummary(txs: Transaction[], categories: CategoryLite[], deps?: RefreshSummaryDeps): Promise<void>` — never throws.

- [ ] **Step 1: Write the failing test**

Create `features/insights/summary.test.ts`:
```ts
import type { CategoryLite } from '@/features/transactions/groupByDay';
import type { Transaction } from '@/features/transactions/types';
import { refreshSummary } from './summary';

const cats: CategoryLite[] = [{ id: 'c1', name: 'Groceries', icon: 'shopping-basket', color: '#adc7ff' }];
const txs: Transaction[] = [];

function fakes() {
  const calls: string[] = [];
  return {
    calls,
    setLoading: jest.fn(() => calls.push('loading')),
    setReady: jest.fn((_t: string) => calls.push('ready')),
    setError: jest.fn(() => calls.push('error')),
  };
}

describe('refreshSummary', () => {
  it('sets loading then ready with the generated text', async () => {
    const f = fakes();
    const generate = jest.fn(async () => 'Похарчихте €820 този месец.');
    await refreshSummary(txs, cats, {
      generate,
      setLoading: f.setLoading,
      setReady: f.setReady,
      setError: f.setError,
    });
    expect(f.calls).toEqual(['loading', 'ready']);
    expect(f.setReady).toHaveBeenCalledWith('Похарчихте €820 този месец.');
  });

  it('sets loading then error when generation returns null', async () => {
    const f = fakes();
    const generate = jest.fn(async () => null);
    await refreshSummary(txs, cats, {
      generate,
      setLoading: f.setLoading,
      setReady: f.setReady,
      setError: f.setError,
    });
    expect(f.calls).toEqual(['loading', 'error']);
  });

  it('swallows a thrown generator error → error status (never rejects)', async () => {
    const f = fakes();
    const generate = jest.fn(async () => {
      throw new Error('boom');
    });
    await expect(
      refreshSummary(txs, cats, {
        generate,
        setLoading: f.setLoading,
        setReady: f.setReady,
        setError: f.setError,
      }),
    ).resolves.toBeUndefined();
    expect(f.calls).toEqual(['loading', 'error']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest features/insights/summary.test.ts`
Expected: FAIL — cannot find module `./summary`.

- [ ] **Step 3: Implement**

Create `features/insights/summary.ts`:
```ts
import { generateInsightsSummary } from '@/services/gemini';
import type { CategoryLite } from '@/features/transactions/groupByDay';
import type { Transaction } from '@/features/transactions/types';
import { buildSummaryInput } from './summaryInput';
import { useSummaryStore } from './summaryStore';

export interface RefreshSummaryDeps {
  generate: typeof generateInsightsSummary;
  setLoading: () => void;
  setReady: (text: string) => void;
  setError: () => void;
}

function defaultDeps(): RefreshSummaryDeps {
  const s = useSummaryStore.getState();
  return {
    generate: generateInsightsSummary,
    setLoading: s.setLoading,
    setReady: s.setReady,
    setError: s.setError,
  };
}

/**
 * Build the current-month snapshot, generate the summary, and write the result to
 * the store. Best-effort: a `null` result or a thrown error both land on `error`
 * (which hides the card). Never throws.
 */
export async function refreshSummary(
  txs: Transaction[],
  categories: CategoryLite[],
  deps: RefreshSummaryDeps = defaultDeps(),
): Promise<void> {
  deps.setLoading();
  try {
    const text = await deps.generate(buildSummaryInput(txs, categories));
    if (text) deps.setReady(text);
    else deps.setError();
  } catch {
    deps.setError();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest features/insights/summary.test.ts && npx tsc --noEmit`
Expected: PASS — 3/3 green; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add features/insights/summary.ts features/insights/summary.test.ts
git commit -m "$(cat <<'EOF'
feat(insights): refreshSummary orchestrator (best-effort)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Wire the Insights screen

**Files:**
- Modify: `app/(app)/insights.tsx`

**Interfaces:**
- Consumes: `useSummaryStore` from `@/features/insights/summaryStore`; `refreshSummary` from `@/features/insights/summary`; existing `filterByUser`, `refreshTransactions`, `useTransactionsStore`, `useAuthStore`, `Skeleton`.

> Screen task — no unit test (logic lives in the tested helpers/orchestrator); gate is `tsc` + lint + full suite.

- [ ] **Step 1: Add imports + state**

In `app/(app)/insights.tsx`:
1. Change the React import to include `useEffect`:
```ts
import { useEffect, useMemo, useState } from 'react';
```
2. Add imports (with the other `@/features` imports):
```ts
import { refreshSummary } from '@/features/insights/summary';
import { useSummaryStore } from '@/features/insights/summaryStore';
```
3. Inside the component, after the existing store selectors, add:
```ts
  const summaryStatus = useSummaryStore((s) => s.status);
  const summaryText = useSummaryStore((s) => s.text);
  const [refreshing, setRefreshing] = useState(false);
```
4. After the existing `const onReview = …` handler (before `const showSkeleton = …`), add the first-generation effect and the refresh handler:
```ts
  // Generate once per session on first view with data (status leaves 'idle' after,
  // so transaction/realtime changes never re-trigger — manual refresh only).
  useEffect(() => {
    if (loaded && transactions.length > 0 && useSummaryStore.getState().status === 'idle') {
      void refreshSummary(filterByUser(transactions, null), categories);
    }
  }, [loaded, transactions, categories]);

  const onRefresh = async () => {
    if (!householdId) return;
    setRefreshing(true);
    try {
      await refreshTransactions(householdId);
      const s = useTransactionsStore.getState();
      await refreshSummary(filterByUser(s.transactions, null), s.categories);
    } finally {
      setRefreshing(false);
    }
  };
```

- [ ] **Step 2: Enable pull-to-refresh on the Screen**

Change the screen opener:
```tsx
    <Screen withTabBar>
```
to:
```tsx
    <Screen withTabBar refreshing={refreshing} onRefresh={onRefresh}>
```

- [ ] **Step 3: Replace the static AI-summary block**

Replace the block that starts with `{/* AI summary — STATIC placeholder (Day 14) */}` (the `<View className="mt-xl flex-row gap-md">…</View>` containing the hardcoded paragraph) with:
```tsx
          {/* AI summary — generated, session-cached; hidden on error/idle */}
          {summaryStatus === 'loading' || (summaryStatus === 'ready' && summaryText) ? (
            <View className="mt-xl flex-row gap-md">
              <View className="w-1 rounded-full bg-surface-tint opacity-30" />
              <View className="flex-1 gap-sm">
                <View className="flex-row items-center gap-sm">
                  <MaterialIcons name="auto-awesome" size={14} color="#c4c6d0" />
                  <SectionLabel>AI обобщение</SectionLabel>
                </View>
                {summaryStatus === 'loading' ? (
                  <Skeleton height={48} />
                ) : (
                  <Text className="font-inter text-body-md leading-relaxed text-on-surface-variant">
                    {summaryText}
                  </Text>
                )}
              </View>
            </View>
          ) : null}
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS — no type or lint errors. (If lint flags an unused import, remove just that import.)

- [ ] **Step 5: Full test run**

Run: `npm test`
Expected: PASS — all suites green (no screen test added).

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/insights.tsx"
git commit -m "$(cat <<'EOF'
feat(insights): render AI summary with session cache + pull-to-refresh

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Build-plan update

**Files:**
- Modify: `teftera-build-plan.md`

> No code. Records Day 14 completion.

- [ ] **Step 1: Check off Day 14 and add a note**

In `teftera-build-plan.md`, under `### Day 14 — AI Spend Insights (Gemini Natural Language Summary)`, change each `- [ ]` to `- [x]` and append a note. Replace the checklist with:
```markdown
- [x] `/services/gemini.ts`: `generateInsightsSummary(monthlyData)` function
  - Builds a structured prompt from aggregated spend data for the current month
  - Returns a 2–3 sentence natural language summary
  - try/catch: on failure, show nothing (hide the summary card)
- [x] Summary renders in the AI Summary section on Insights screen with the left accent line + sparkle icon
- [x] Regenerate on pull-to-refresh
- [x] Cache the summary in Zustand for the session (don't re-call Gemini on every tab switch)

> Implemented on branch `feat/day14-ai-spend-summary` (plan `docs/superpowers/plans/2026-06-29-day14-ai-spend-summary.md`). Summary is fixed to **current-month household** scope (ignores the Insights range/person controls), session-cached in `summaryStore`, regenerated only on pull-to-refresh, and hidden on failure/no-data. Uses `gemini-2.5-flash` with the shared transient retry; pure `buildSummaryInput` + `buildSummaryPrompt` are unit-tested.
```

- [ ] **Step 2: Commit**

```bash
git add teftera-build-plan.md
git commit -m "$(cat <<'EOF'
docs(day14): mark AI spend summary complete

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** `generateInsightsSummary` + prompt in the chokepoint (T1) · current-month household input (T2) · session cache store (T3) · best-effort orchestrator with hide-on-failure (T4) · render loading/ready/hidden + sparkle/accent (T5) · first-gen on view + pull-to-refresh regenerate (T5) · fixed scope ignores range/person (T2 builds from `filterByUser(txs,null)` current month; T5 passes household txs) · gemini-2.5-flash + retry (T1) · plain-text Bulgarian, hide on empty/over-long (T1). All spec sections map to a task.
- **Type consistency:** `SummaryInput` defined in `services/gemini.ts` (T1), consumed by `buildSummaryInput` (T2) and `buildSummaryPrompt`/`generateInsightsSummary` (T1); `refreshSummary`/`RefreshSummaryDeps` (T4) consume `generateInsightsSummary` (T1) + `buildSummaryInput` (T2) + `useSummaryStore` (T3); the screen (T5) consumes `useSummaryStore` (T3) + `refreshSummary` (T4). `SummaryStatus` values match between store (T3) and screen checks (T5): `idle`/`loading`/`ready`/`error`.
- **No placeholders:** every code step is complete; the one conditional ("remove an unused import if lint flags it") is a concrete lint-driven action.
- **Dependency direction:** `SummaryInput` lives in `services/gemini.ts` (like `ReceiptExtraction`), so `features/insights` → `services` (correct), not the reverse.

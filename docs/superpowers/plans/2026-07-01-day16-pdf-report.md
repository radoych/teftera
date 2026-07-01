# Day 16 — PDF Monthly Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a branded, dark-themed monthly PDF report exported from the Insights screen — pick a month, generate a PDF client-side, share it via the native share sheet.

**Architecture:** A new pure `features/reports/` slice reuses the existing aggregation helpers to assemble a serializable `ReportData` payload (`buildReportData`), renders it to an HTML string (`buildReportHtml`), and turns that into a PDF at a single isolated seam (`generateReportPdf` via `expo-print`) shared through `expo-sharing`. The seam is the only thing that changes when the report later moves to a Cloud Run backend.

**Tech Stack:** React Native + Expo (managed), TypeScript strict, `expo-print`, `expo-sharing`, Jest.

## Global Constraints

- **Money = integer euro cents.** Never float math. All money display goes through `formatCurrency` from `@/lib/formatCurrency`.
- **Currency is EUR (€).** No `$`, no USD.
- **TypeScript strict; no `any`; no plain `.js`.**
- **Language is bg-BG** for all user-facing copy.
- **Household-scoped, month-picked, client-side.** The report always covers the full household for the picked month; the FastAPI/Cloud Run backend and scheduled auto-generation are deferred.
- **AI summary is included only when the picked month is the current month** (reuse the cached Day 14 text; never fire a fresh Gemini call for a report).
- **Free deps only.** `expo-print` + `expo-sharing` (both free, first-party Expo) are the only new dependencies.
- **Conventional commits**, small and frequent.
- Spec: `docs/superpowers/specs/2026-07-01-day16-pdf-report-design.md`.

**Spec refinement (decided during planning):** the report header drops `householdName` — no household name is loaded into any store, and adding a query is scope creep for a 2-person household where the embedded logo already carries the brand. Header = logo + "Месечен отчет" + month label.

---

## File Structure

```
features/reports/
  types.ts          ReportData payload shape + BuildReportInput
  reportData.ts     buildReportData, monthPickerOptions   (pure, tested)
  reportData.test.ts
  reportHtml.ts     buildReportHtml(data, logoDataUri)     (pure, tested)
  reportHtml.test.ts
  logo.ts           TEFTERA_LOGO_DATA_URI (generated base64)
  logo.test.ts
  generatePdf.ts    generateReportPdf                      (IO — the Cloud Run swap seam)
  export.ts         exportMonthlyReport, EmptyMonthError   (IO orchestrator, tested with mocks)
  export.test.ts
assets/logo.png     committed logo source
app/(app)/insights.tsx   Export icon + month-picker BottomSheet + busy/error (edit)
package.json             + expo-print, expo-sharing
```

---

### Task 1: `types.ts` + `buildReportData` (pure aggregation)

**Files:**
- Create: `features/reports/types.ts`
- Create: `features/reports/reportData.ts`
- Test: `features/reports/reportData.test.ts`

**Interfaces:**
- Consumes (all existing, unchanged):
  - `sumCents(txs) => number`, `monthlyTrend(txs, monthsBack, now) => TrendMonth[]`, `topMerchants(txs, n) => MerchantSpend[]` from `@/features/insights/aggregate`
  - `pctChange(current, previous) => number | null`, `categoryBreakdown(txs, categories) => CategorySpend[]` from `@/features/transactions/dashboard`
  - `filterByDateBounds(txs, startISO, endISO) => Transaction[]` from `@/features/insights/range`
  - `resolveBudgetsForMonth(rows, month) => Map<string,number>` from `@/features/budgets/resolve`, `budgetProgress(resolved, spend) => BudgetProgress[]` from `@/features/budgets/progress`
  - `toISODate(d) => string`, `firstOfMonth(d) => string` from `@/lib/dates`
  - Types: `Transaction` (`@/features/transactions/types`), `CategoryLite` (`@/features/transactions/groupByDay`), `BudgetRow` + `BudgetState` (`@/features/budgets/types`), `OpenAnomaly` (`@/features/anomalies/api`)
- Produces:
  - `buildReportData(input: BuildReportInput): ReportData`
  - `monthPickerOptions(now?: Date, count?: number): MonthOption[]`
  - Types `ReportData`, `BuildReportInput`, `MonthOption` (see below)

- [ ] **Step 1: Write `types.ts`**

```ts
// features/reports/types.ts
import type { Transaction } from '@/features/transactions/types';
import type { CategoryLite } from '@/features/transactions/groupByDay';
import type { BudgetRow, BudgetState } from '@/features/budgets/types';
import type { OpenAnomaly } from '@/features/anomalies/api';

export interface ReportCategory {
  name: string;
  color: string;
  totalCents: number;
  share: number; // 0..1 of the month total (drives the donut)
}
export interface ReportTrendMonth {
  label: string; // bg-BG 3-letter month
  fraction: number; // 0..1 of the tallest bar
  isCurrent: boolean; // the report's own month
}
export interface ReportMerchant {
  merchant: string;
  totalCents: number;
}
export interface ReportBudget {
  name: string;
  color: string;
  budgetCents: number;
  spentCents: number;
  pct: number;
  state: BudgetState;
}
export interface ReportAnomaly {
  merchant: string;
  amountCents: number;
  reason: string;
}

/** The serializable payload a future Cloud Run service would receive verbatim. */
export interface ReportData {
  monthLabel: string; // "Юни 2026 г."
  monthISO: string; // "2026-06"
  totalCents: number;
  pctVsPrevMonth: number | null;
  categories: ReportCategory[];
  trend: ReportTrendMonth[];
  merchants: ReportMerchant[];
  budgets: ReportBudget[];
  anomalies: ReportAnomaly[];
  aiSummary: string | null; // present only when the month is the current month
}

export interface BuildReportInput {
  transactions: Transaction[];
  categories: CategoryLite[];
  budgetRows: BudgetRow[];
  openAnomalies: OpenAnomaly[];
  month: Date; // any date within the target month
  now?: Date; // defaults to new Date()
  aiSummaryText?: string | null; // cached Day 14 summary; used only if month is current
}

export interface MonthOption {
  monthISO: string;
  label: string; // "Юни 2026 г."
  date: Date; // first of that month
}
```

- [ ] **Step 2: Write the failing test**

```ts
// features/reports/reportData.test.ts
import { buildReportData, monthPickerOptions } from './reportData';
import type { BuildReportInput } from './types';
import type { Transaction } from '@/features/transactions/types';
import type { CategoryLite } from '@/features/transactions/groupByDay';

const cats: CategoryLite[] = [
  { id: 'groc', name: 'Хранителни', icon: 'shopping-cart', color: '#adc7ff' },
  { id: 'fun', name: 'Забавления', icon: 'movie', color: '#ffdfa7' },
];

function tx(over: Partial<Transaction>): Transaction {
  return {
    id: 't', household_id: 'h', user_id: 'u', amount_eur: 1000,
    original_amount: null, original_currency: null, merchant: 'Kaufland',
    category_id: 'groc', date: '2026-06-10', note: null, source: 'manual',
    receipt_id: null, is_flagged: false, occurred_at: null, created_at: '2026-06-10T00:00:00Z',
    ...over,
  };
}

const base: Omit<BuildReportInput, 'month'> = {
  transactions: [
    tx({ id: 'a', amount_eur: 3000, category_id: 'groc', merchant: 'Kaufland', date: '2026-06-05' }),
    tx({ id: 'b', amount_eur: 1000, category_id: 'fun', merchant: 'Kino', date: '2026-06-20' }),
    tx({ id: 'c', amount_eur: 2000, category_id: 'groc', merchant: 'Lidl', date: '2026-05-15' }),
  ],
  categories: cats,
  budgetRows: [{ id: 'bd', household_id: 'h', category_id: 'groc', amount_eur: 5000, month: '2026-06-01' }],
  openAnomalies: [{ id: 'an', transactionId: 'a', reason: 'Над обичайното', score: 3.1 }],
  now: new Date(2026, 6, 1), // July 2026 → June is a PAST month
  aiSummaryText: 'Тестово обобщение',
};

describe('buildReportData', () => {
  const data = buildReportData({ ...base, month: new Date(2026, 5, 15) }); // June 2026

  it('totals only the target month in cents', () => {
    expect(data.totalCents).toBe(4000); // 3000 + 1000, excludes the May row
  });

  it('computes pct vs previous month', () => {
    expect(data.pctVsPrevMonth).toBe(100); // 4000 vs 2000 (May) → +100%
  });

  it('gives each category its share of the month total', () => {
    const groc = data.categories.find((c) => c.name === 'Хранителни');
    expect(groc?.totalCents).toBe(3000);
    expect(groc?.share).toBeCloseTo(0.75, 5);
  });

  it('maps budgets for the target month', () => {
    const b = data.budgets.find((x) => x.name === 'Хранителни');
    expect(b).toMatchObject({ budgetCents: 5000, spentCents: 3000, state: 'under' });
  });

  it('includes only the month\'s anomalies', () => {
    expect(data.anomalies).toEqual([{ merchant: 'Kaufland', amountCents: 3000, reason: 'Над обичайното' }]);
  });

  it('omits the AI summary for a past month', () => {
    expect(data.aiSummary).toBeNull();
  });

  it('includes the AI summary when the month is the current month', () => {
    const cur = buildReportData({ ...base, month: new Date(2026, 6, 3), now: new Date(2026, 6, 3) });
    expect(cur.aiSummary).toBe('Тестово обобщение');
  });

  it('labels the month in bg-BG', () => {
    expect(data.monthLabel.startsWith('Юни')).toBe(true);
    expect(data.monthISO).toBe('2026-06');
  });
});

describe('monthPickerOptions', () => {
  it('returns the last 12 months, current first', () => {
    const opts = monthPickerOptions(new Date(2026, 6, 1));
    expect(opts).toHaveLength(12);
    expect(opts[0]!.monthISO).toBe('2026-07');
    expect(opts[11]!.monthISO).toBe('2025-08');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx jest features/reports/reportData.test.ts`
Expected: FAIL — `Cannot find module './reportData'`.

- [ ] **Step 4: Implement `reportData.ts`**

```ts
// features/reports/reportData.ts
import { sumCents, monthlyTrend, topMerchants } from '@/features/insights/aggregate';
import { pctChange, categoryBreakdown } from '@/features/transactions/dashboard';
import { filterByDateBounds } from '@/features/insights/range';
import { resolveBudgetsForMonth } from '@/features/budgets/resolve';
import { budgetProgress } from '@/features/budgets/progress';
import { toISODate, firstOfMonth } from '@/lib/dates';
import type { BuildReportInput, MonthOption, ReportData } from './types';

function monthBounds(month: Date): { startISO: string; endISO: string } {
  const y = month.getFullYear();
  const m = month.getMonth();
  return { startISO: toISODate(new Date(y, m, 1)), endISO: toISODate(new Date(y, m + 1, 0)) };
}

function monthISOof(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabelOf(d: Date): string {
  const s = new Intl.DateTimeFormat('bg-BG', { month: 'long', year: 'numeric' }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function buildReportData(input: BuildReportInput): ReportData {
  const now = input.now ?? new Date();
  const { month } = input;
  const { startISO, endISO } = monthBounds(month);
  const monthTxs = filterByDateBounds(input.transactions, startISO, endISO);

  const totalCents = sumCents(monthTxs);

  const prev = new Date(month.getFullYear(), month.getMonth() - 1, 1);
  const pb = monthBounds(prev);
  const prevTotal = sumCents(filterByDateBounds(input.transactions, pb.startISO, pb.endISO));
  const pctVsPrevMonth = pctChange(totalCents, prevTotal);

  const catRows = categoryBreakdown(monthTxs, input.categories);
  const categories = catRows.map((c) => ({
    name: c.name,
    color: c.color,
    totalCents: c.totalCents,
    share: totalCents > 0 ? c.totalCents / totalCents : 0,
  }));

  const trend = monthlyTrend(input.transactions, 6, month).map((t) => ({
    label: t.label,
    fraction: t.fraction,
    isCurrent: t.isCurrent,
  }));

  const merchants = topMerchants(monthTxs, 5);

  const resolved = resolveBudgetsForMonth(input.budgetRows, firstOfMonth(month));
  const spend = catRows.map((c) => ({ id: c.id, totalCents: c.totalCents }));
  const catById = new Map(input.categories.map((c) => [c.id, c]));
  const budgets = budgetProgress(resolved, spend).map((b) => {
    const cat = catById.get(b.categoryId);
    return {
      name: cat?.name ?? 'Other',
      color: cat?.color ?? '#8e909a',
      budgetCents: b.budgetCents,
      spentCents: b.spentCents,
      pct: b.pct,
      state: b.state,
    };
  });

  const monthTxById = new Map(monthTxs.map((t) => [t.id, t]));
  const anomalies = input.openAnomalies
    .filter((a) => monthTxById.has(a.transactionId))
    .map((a) => {
      const t = monthTxById.get(a.transactionId)!;
      return { merchant: t.merchant, amountCents: t.amount_eur, reason: a.reason };
    });

  const isCurrentMonth = firstOfMonth(month) === firstOfMonth(now);
  const aiSummary = isCurrentMonth ? (input.aiSummaryText ?? null) : null;

  return {
    monthLabel: monthLabelOf(month),
    monthISO: monthISOof(month),
    totalCents,
    pctVsPrevMonth,
    categories,
    trend,
    merchants,
    budgets,
    anomalies,
    aiSummary,
  };
}

export function monthPickerOptions(now: Date = new Date(), count = 12): MonthOption[] {
  const out: MonthOption[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ monthISO: monthISOof(d), label: monthLabelOf(d), date: d });
  }
  return out;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest features/reports/reportData.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add features/reports/types.ts features/reports/reportData.ts features/reports/reportData.test.ts
git commit -m "feat(reports): buildReportData + month options for the PDF report"
```

---

### Task 2: `buildReportHtml` (pure HTML/CSS renderer)

**Files:**
- Create: `features/reports/reportHtml.ts`
- Test: `features/reports/reportHtml.test.ts`

**Interfaces:**
- Consumes: `ReportData` (Task 1); `formatCurrency(cents) => string` from `@/lib/formatCurrency`.
- Produces: `buildReportHtml(data: ReportData, logoDataUri: string): string`.

- [ ] **Step 1: Write the failing test**

```ts
// features/reports/reportHtml.test.ts
import { buildReportHtml } from './reportHtml';
import type { ReportData } from './types';

const data: ReportData = {
  monthLabel: 'Юни 2026 г.',
  monthISO: '2026-06',
  totalCents: 4000,
  pctVsPrevMonth: 100,
  categories: [
    { name: 'Хранителни', color: '#adc7ff', totalCents: 3000, share: 0.75 },
    { name: 'Забавления', color: '#ffdfa7', totalCents: 1000, share: 0.25 },
  ],
  trend: [{ label: 'ЮНИ', fraction: 1, isCurrent: true }],
  merchants: [{ merchant: 'Kaufland <BG> & "co"', totalCents: 3000 }],
  budgets: [{ name: 'Хранителни', color: '#adc7ff', budgetCents: 5000, spentCents: 3000, pct: 60, state: 'under' }],
  anomalies: [{ merchant: 'Kaufland', amountCents: 3000, reason: 'Над обичайното' }],
  aiSummary: 'Тестово обобщение',
};

describe('buildReportHtml', () => {
  it('renders the month label and total', () => {
    const html = buildReportHtml(data, 'data:image/png;base64,AAA');
    expect(html).toContain('Юни 2026 г.');
    expect(html).toContain('€40,00'); // formatCurrency(4000)
  });

  it('embeds the logo data uri', () => {
    expect(buildReportHtml(data, 'data:image/png;base64,AAA')).toContain('src="data:image/png;base64,AAA"');
  });

  it('escapes user strings to avoid breaking the markup', () => {
    const html = buildReportHtml(data, 'x');
    expect(html).toContain('Kaufland &lt;BG&gt; &amp; &quot;co&quot;');
    expect(html).not.toContain('Kaufland <BG>');
  });

  it('builds a conic-gradient donut whose segments cover 100%', () => {
    const html = buildReportHtml(data, 'x');
    expect(html).toContain('conic-gradient(');
    expect(html).toContain('100.00%');
  });

  it('omits the anomalies and AI-summary blocks when empty', () => {
    const html = buildReportHtml({ ...data, anomalies: [], aiSummary: null }, 'x');
    expect(html).not.toContain('Аномалии');
    expect(html).not.toContain('AI обобщение');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest features/reports/reportHtml.test.ts`
Expected: FAIL — `Cannot find module './reportHtml'`.

- [ ] **Step 3: Implement `reportHtml.ts`**

```ts
// features/reports/reportHtml.ts
import { formatCurrency } from '@/lib/formatCurrency';
import type { ReportData, ReportCategory } from './types';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]!);
}

function donutGradient(cats: ReportCategory[]): string {
  if (cats.length === 0) return '#343538';
  let acc = 0;
  const stops = cats.map((c, i) => {
    const start = acc * 100;
    acc += c.share;
    // Force the last segment to end at exactly 100.00% (guards float drift).
    const end = i === cats.length - 1 ? 100 : acc * 100;
    return `${c.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
  });
  return `conic-gradient(${stops.join(', ')})`;
}

function pctLine(pct: number | null): string {
  if (pct === null) return '';
  const up = pct > 0;
  const color = up ? '#ffb4ab' : '#adc7ff';
  const arrow = up ? '▲' : '▼';
  return `<div class="pct" style="color:${color}">${arrow} ${Math.abs(pct)}% спрямо миналия месец</div>`;
}

export function buildReportHtml(data: ReportData, logoDataUri: string): string {
  const legend = data.categories
    .map(
      (c) => `<div class="row">
        <span class="dot" style="background:${c.color}"></span>
        <span class="grow">${esc(c.name)}</span>
        <span class="mono">${formatCurrency(c.totalCents)}</span>
      </div>`,
    )
    .join('');

  const trendBars = data.trend
    .map(
      (t) => `<div class="tcol">
        <div class="tbar ${t.isCurrent ? 'cur' : ''}" style="height:${Math.max(t.fraction * 100, 2)}%"></div>
        <div class="tlab">${esc(t.label)}</div>
      </div>`,
    )
    .join('');

  const merchantRows = data.merchants
    .map(
      (m) => `<div class="row">
        <span class="grow">${esc(m.merchant)}</span>
        <span class="mono">${formatCurrency(m.totalCents)}</span>
      </div>`,
    )
    .join('');

  const budgetRows = data.budgets
    .map((b) => {
      const barColor = b.state === 'over' ? '#ffb4ab' : b.state === 'warning' ? '#ffdfa7' : '#adc7ff';
      return `<div class="brow">
        <div class="row"><span class="grow">${esc(b.name)}</span>
          <span class="mono">${formatCurrency(b.spentCents)} / ${formatCurrency(b.budgetCents)}</span></div>
        <div class="track"><div class="fill" style="width:${Math.min(b.pct, 100)}%;background:${barColor}"></div></div>
      </div>`;
    })
    .join('');

  const anomalyBlock = data.anomalies.length
    ? `<div class="label">Аномалии</div>
       ${data.anomalies
         .map(
           (a) => `<div class="row"><span class="grow" style="color:#c3f400">${esc(a.merchant)}</span>
             <span class="mono" style="color:#c3f400">${formatCurrency(a.amountCents)}</span></div>
             <div class="reason">${esc(a.reason)}</div>`,
         )
         .join('')}`
    : '';

  const summaryBlock = data.aiSummary
    ? `<div class="summary"><div class="label">AI обобщение</div><p>${esc(data.aiSummary)}</p></div>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; background: #121316; color: #e3e2e6;
    font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; }
  .head { display: flex; align-items: center; gap: 16px; margin-bottom: 8px; }
  .head img { height: 40px; }
  .head .brand { font-size: 12px; letter-spacing: 0.05em; text-transform: uppercase; color: #8e909a; }
  .month { font-size: 28px; font-weight: 600; margin: 4px 0; }
  .total { font-size: 40px; font-weight: 600; color: #adc7ff; }
  .pct { font-size: 13px; margin-top: 4px; }
  .label { font-size: 12px; letter-spacing: 0.05em; text-transform: uppercase;
    color: #8e909a; margin: 28px 0 12px; }
  hr { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 24px 0; }
  .donutwrap { display: flex; align-items: center; gap: 24px; }
  .donut { width: 140px; height: 140px; border-radius: 50%;
    background: ${donutGradient(data.categories)};
    -webkit-mask: radial-gradient(circle 42px at center, transparent 98%, #000 100%);
            mask: radial-gradient(circle 42px at center, transparent 98%, #000 100%); }
  .legend { flex: 1; }
  .row { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
  .grow { flex: 1; }
  .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .mono { font-variant-numeric: tabular-nums; font-weight: 600; }
  .trend { display: flex; align-items: flex-end; gap: 12px; height: 120px; }
  .tcol { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
  .tbar { width: 100%; background: #343538; border-radius: 4px 4px 0 0; }
  .tbar.cur { background: rgba(173,199,255,0.5); border-top: 2px solid #adc7ff; }
  .tlab { font-size: 10px; color: #8e909a; margin-top: 6px; }
  .track { height: 6px; border-radius: 9999px; background: #1e2023; overflow: hidden; margin-top: 6px; }
  .fill { height: 100%; border-radius: 9999px; }
  .brow { margin-bottom: 14px; }
  .reason { font-size: 10px; text-transform: uppercase; color: #c3f400; margin-bottom: 8px; }
  .summary { border-left: 2px solid #adc7ff; padding-left: 12px; }
  .summary p { color: #c4c6d0; line-height: 1.6; font-size: 14px; margin: 0; }
</style></head>
<body>
  <div class="head"><img src="${logoDataUri}" alt="Teftera" /><div class="brand">Месечен отчет</div></div>
  <div class="month">${esc(data.monthLabel)}</div>
  <div class="total">${formatCurrency(data.totalCents)}</div>
  ${pctLine(data.pctVsPrevMonth)}
  ${summaryBlock}
  <hr />
  <div class="label">Разходи по категория</div>
  <div class="donutwrap"><div class="donut"></div><div class="legend">${legend || '<div class="reason">Няма разходи</div>'}</div></div>
  <hr />
  <div class="label">Месечна тенденция</div>
  <div class="trend">${trendBars}</div>
  <hr />
  <div class="label">Топ търговци</div>
  ${merchantRows || '<div class="reason">Няма търговци</div>'}
  <hr />
  <div class="label">Бюджет</div>
  ${budgetRows || '<div class="reason">Няма зададени бюджети</div>'}
  ${anomalyBlock ? '<hr />' + anomalyBlock : ''}
</body></html>`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest features/reports/reportHtml.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/reports/reportHtml.ts features/reports/reportHtml.test.ts
git commit -m "feat(reports): dark-themed HTML/donut renderer for the PDF report"
```

---

### Task 3: Logo asset + base64 module

**Files:**
- Create: `assets/logo.png` (copied from the main checkout)
- Create: `features/reports/logo.ts`
- Test: `features/reports/logo.test.ts`

**Interfaces:**
- Produces: `TEFTERA_LOGO_DATA_URI: string` (a `data:image/png;base64,…` URI).

- [ ] **Step 1: Bring the logo into the worktree and commit it**

The logo exists only in the main checkout (untracked). Copy it in:

Run:
```bash
cp "D:/IT Partner/Python/Teftera/assets/logo.png" assets/logo.png
git add assets/logo.png
```
Expected: `assets/logo.png` (~214 KB) staged.

- [ ] **Step 2: Generate the base64 module from the PNG**

Run:
```bash
node -e "const fs=require('fs');const b=fs.readFileSync('assets/logo.png').toString('base64');fs.writeFileSync('features/reports/logo.ts','// Generated from assets/logo.png — do not edit by hand.\nexport const TEFTERA_LOGO_DATA_URI =\n  \x27data:image/png;base64,'+b+'\x27;\n');"
```
Expected: `features/reports/logo.ts` created with a single exported constant.

- [ ] **Step 3: Write the test**

```ts
// features/reports/logo.test.ts
import { TEFTERA_LOGO_DATA_URI } from './logo';

describe('TEFTERA_LOGO_DATA_URI', () => {
  it('is a png data uri', () => {
    expect(TEFTERA_LOGO_DATA_URI.startsWith('data:image/png;base64,')).toBe(true);
    expect(TEFTERA_LOGO_DATA_URI.length).toBeGreaterThan(1000);
  });
});
```

- [ ] **Step 4: Run the test and typecheck**

Run: `npx jest features/reports/logo.test.ts && npx tsc --noEmit`
Expected: PASS, and no type errors.

- [ ] **Step 5: Commit**

```bash
git add assets/logo.png features/reports/logo.ts features/reports/logo.test.ts
git commit -m "feat(reports): embed the Teftera logo as a base64 module"
```

---

### Task 4: PDF generation + export orchestrator (IO seam)

**Files:**
- Create: `features/reports/generatePdf.ts`
- Create: `features/reports/export.ts`
- Test: `features/reports/export.test.ts`
- Modify: `package.json` (add `expo-print`, `expo-sharing`)

**Interfaces:**
- Consumes: `buildReportData` (Task 1), `buildReportHtml` (Task 2), `TEFTERA_LOGO_DATA_URI` (Task 3), `BuildReportInput` (Task 1).
- Produces:
  - `generateReportPdf(data: ReportData): Promise<string>` — returns a local file URI. **The Cloud Run swap seam.**
  - `exportMonthlyReport(input: BuildReportInput): Promise<void>`
  - `class EmptyMonthError extends Error`

- [ ] **Step 1: Install the two Expo packages**

Run:
```bash
npx expo install expo-print expo-sharing
```
Expected: both added to `package.json` at Expo-compatible versions.

- [ ] **Step 2: Implement `generatePdf.ts` (the swap seam)**

```ts
// features/reports/generatePdf.ts
// The ONLY module that changes when the report moves to a Cloud Run backend:
// today it renders locally with expo-print; later it POSTs `data` to the service
// and writes the returned PDF to a file. Everything upstream stays identical.
import * as Print from 'expo-print';
import { buildReportHtml } from './reportHtml';
import { TEFTERA_LOGO_DATA_URI } from './logo';
import type { ReportData } from './types';

export async function generateReportPdf(data: ReportData): Promise<string> {
  const html = buildReportHtml(data, TEFTERA_LOGO_DATA_URI);
  const { uri } = await Print.printToFileAsync({ html });
  return uri;
}
```

- [ ] **Step 3: Write the failing test for the orchestrator**

```ts
// features/reports/export.test.ts
import type { BuildReportInput } from './types';
import type { Transaction } from '@/features/transactions/types';

const generateReportPdf = jest.fn();
const isAvailableAsync = jest.fn();
const shareAsync = jest.fn();

jest.mock('./generatePdf', () => ({ generateReportPdf: (d: unknown) => generateReportPdf(d) }));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => isAvailableAsync(),
  shareAsync: (...a: unknown[]) => shareAsync(...a),
}));

import { exportMonthlyReport, EmptyMonthError } from './export';

function tx(over: Partial<Transaction>): Transaction {
  return {
    id: 'a', household_id: 'h', user_id: 'u', amount_eur: 3000, original_amount: null,
    original_currency: null, merchant: 'Kaufland', category_id: null, date: '2026-06-05',
    note: null, source: 'manual', receipt_id: null, is_flagged: false, occurred_at: null,
    created_at: '2026-06-05T00:00:00Z', ...over,
  };
}

const baseInput: BuildReportInput = {
  transactions: [], categories: [], budgetRows: [], openAnomalies: [],
  month: new Date(2026, 5, 15), now: new Date(2026, 6, 1),
};

beforeEach(() => {
  generateReportPdf.mockReset().mockResolvedValue('file:///report.pdf');
  isAvailableAsync.mockReset().mockResolvedValue(true);
  shareAsync.mockReset().mockResolvedValue(undefined);
});

describe('exportMonthlyReport', () => {
  it('throws EmptyMonthError and never renders when the month has no transactions', async () => {
    await expect(exportMonthlyReport(baseInput)).rejects.toBeInstanceOf(EmptyMonthError);
    expect(generateReportPdf).not.toHaveBeenCalled();
    expect(shareAsync).not.toHaveBeenCalled();
  });

  it('generates and shares the PDF for a month with data', async () => {
    await exportMonthlyReport({ ...baseInput, transactions: [tx({})] });
    expect(generateReportPdf).toHaveBeenCalledTimes(1);
    expect(shareAsync).toHaveBeenCalledWith(
      'file:///report.pdf',
      expect.objectContaining({ mimeType: 'application/pdf' }),
    );
  });

  it('throws with the file path when sharing is unavailable', async () => {
    isAvailableAsync.mockResolvedValue(false);
    await expect(exportMonthlyReport({ ...baseInput, transactions: [tx({})] })).rejects.toThrow('file:///report.pdf');
    expect(shareAsync).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx jest features/reports/export.test.ts`
Expected: FAIL — `Cannot find module './export'`.

- [ ] **Step 5: Implement `export.ts`**

```ts
// features/reports/export.ts
import * as Sharing from 'expo-sharing';
import { buildReportData } from './reportData';
import { generateReportPdf } from './generatePdf';
import type { BuildReportInput } from './types';

/** Thrown when the picked month has no transactions — the caller shows a hint, no file is made. */
export class EmptyMonthError extends Error {
  constructor() {
    super('empty month');
    this.name = 'EmptyMonthError';
  }
}

export async function exportMonthlyReport(input: BuildReportInput): Promise<void> {
  const data = buildReportData(input);
  if (data.categories.length === 0) throw new EmptyMonthError();

  const uri = await generateReportPdf(data);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error(`Файлът е запазен: ${uri}`);
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: `Отчет ${data.monthLabel}`,
  });
}
```

- [ ] **Step 6: Run tests + typecheck to verify they pass**

Run: `npx jest features/reports/export.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add features/reports/generatePdf.ts features/reports/export.ts features/reports/export.test.ts package.json package-lock.json
git commit -m "feat(reports): expo-print PDF seam + share orchestrator"
```

---

### Task 5: Insights screen — Export icon + month picker

**Files:**
- Modify: `app/(app)/insights.tsx`

**Interfaces:**
- Consumes: `exportMonthlyReport`, `EmptyMonthError` (`@/features/reports/export`); `monthPickerOptions`, `MonthOption` (`@/features/reports/reportData` / `types`); `BottomSheet` (`@/components/BottomSheet`); existing stores (`useTransactionsStore`, `useBudgetsStore`, `useSummaryStore`).

There is no unit test for this task — it is screen wiring verified by typecheck, lint, and the on-device checkpoint.

- [ ] **Step 1: Add imports**

Add near the other imports in `app/(app)/insights.tsx`:

```tsx
import { BottomSheet } from '@/components/BottomSheet';
import { exportMonthlyReport, EmptyMonthError } from '@/features/reports/export';
import { monthPickerOptions } from '@/features/reports/reportData';
import type { MonthOption } from '@/features/reports/types';
```

- [ ] **Step 2: Add export state + handler**

Inside `InsightsScreen`, after the existing `const [scope, setScope] = ...` line:

```tsx
const [pickerVisible, setPickerVisible] = useState(false);
const [exporting, setExporting] = useState(false);
const monthOptions = useMemo(() => monthPickerOptions(now), [now]);

const onPickMonth = async (opt: MonthOption) => {
  setPickerVisible(false);
  setExporting(true);
  try {
    const s = useTransactionsStore.getState();
    await exportMonthlyReport({
      transactions: s.transactions,
      categories: s.categories,
      budgetRows: useBudgetsStore.getState().rows,
      openAnomalies: s.openAnomalies,
      month: opt.date,
      now,
      aiSummaryText: useSummaryStore.getState().text,
    });
  } catch (e) {
    if (e instanceof EmptyMonthError) {
      Alert.alert('Няма данни', 'Няма транзакции за този месец.');
    } else {
      Alert.alert('Грешка', 'Неуспешно генериране на PDF.');
    }
  } finally {
    setExporting(false);
  }
};
```

- [ ] **Step 3: Replace the title with a title row that carries the Export icon**

Replace the existing title `Text` (`Анализи`) with:

```tsx
<View className="mb-lg mt-md flex-row items-center justify-between">
  <Text className="font-jakarta-semibold text-headline-xl text-on-surface">Анализи</Text>
  {!showEmpty && !showSkeleton ? (
    <Pressable
      onPress={() => setPickerVisible(true)}
      disabled={exporting}
      hitSlop={8}
      className="h-10 w-10 items-center justify-center rounded-full bg-surface-container-high"
      style={{ opacity: exporting ? 0.5 : 1 }}>
      {exporting ? (
        <ActivityIndicator size="small" color="#adc7ff" />
      ) : (
        <MaterialIcons name="ios-share" size={20} color="#adc7ff" />
      )}
    </Pressable>
  ) : null}
</View>
```

Add `ActivityIndicator` to the existing `react-native` import.

- [ ] **Step 4: Add the month-picker sheet before the closing `</Screen>`**

```tsx
<BottomSheet visible={pickerVisible} onClose={() => setPickerVisible(false)}>
  <View className="px-lg pb-lg pt-sm">
    <SectionLabel className="mb-md">Изтегли отчет за месец</SectionLabel>
    {monthOptions.map((opt) => (
      <Pressable
        key={opt.monthISO}
        onPress={() => onPickMonth(opt)}
        className="flex-row items-center justify-between py-md">
        <Text className="font-inter text-body-lg text-on-surface">{opt.label}</Text>
        <MaterialIcons name="picture-as-pdf" size={20} color="#8e909a" />
      </Pressable>
    ))}
  </View>
</BottomSheet>
```

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/insights.tsx"
git commit -m "feat(reports): Export button + month picker on Insights"
```

---

### Task 6: Build-plan checkoff + docs

**Files:**
- Modify: `teftera-build-plan.md` (Day 16 section)

- [ ] **Step 1: Check off the delivered Day 16 items**

In `teftera-build-plan.md`, under **Day 16 — PDF Monthly Report**, mark the client-side PDF export items done and annotate the deferrals, e.g.:

```markdown
- [x] "Export" button on Insights screen calls the generator, shares PDF via `expo-sharing`
- [x] Client-side PDF via `expo-print` (dark-themed HTML + CSS donut; month picker, last 12 months; household-scoped)
- [ ] FastAPI micro-service on GCP Cloud Run — **deferred** (isolated behind the `generateReportPdf` seam; see spec)
- [ ] Scheduled monthly auto-generation — **deferred** to the Cloud Run phase

> Implemented on branch `worktree-day16-pdf-report`. New pure `features/reports/`
> slice (`buildReportData`, `buildReportHtml`, `monthPickerOptions`) is unit-tested;
> the `generateReportPdf` seam keeps the Cloud Run swap a one-file change. AI summary
> is included only for the current month (reuses the cached Day 14 text — no extra
> Gemini call). Spec: `docs/superpowers/specs/2026-07-01-day16-pdf-report-design.md`.
```

- [ ] **Step 2: Full test + typecheck sweep**

Run: `npx jest features/reports && npx tsc --noEmit && npm run lint`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add teftera-build-plan.md
git commit -m "docs(day16): check off client-side PDF report in build plan"
```

---

## On-device checkpoint (human verification)

Tap **Export** on Insights → pick a month → a branded dark PDF opens in the share sheet with the month total, category donut, 6-month trend, top merchants, budget vs actual, and (for the current month) the AI summary. Picking a month with no transactions shows "Няма данни".

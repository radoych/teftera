# Day 16 — PDF Monthly Report — Design

Date: 2026-07-01
Status: Approved (pending implementation plan)

Personal finance app for a shared two-person household. Day 16 adds a branded,
dark-themed **monthly PDF report** exported from the Insights screen. The report is
generated **client-side** from an HTML template (`expo-print`) and shared via the
native share sheet (`expo-sharing`), reusing the aggregation helpers the Insights
screen already uses.

---

## Decisions (locked)

1. **Client-side now, Cloud Run later.** The PDF is generated on-device with
   `expo-print`. The optional FastAPI/Cloud Run backend from the build plan is
   **deferred**. The design isolates a single swappable seam
   (`generateReportPdf(data)`) so moving to Cloud Run later is a one-file change —
   `buildReportData` (the JSON payload) stays identical; only the "data → PDF" step
   swaps from local render to `POST → service → PDF binary`.
2. **Month picker, last 12 months.** Export is not fixed to the current month — the
   user picks which month to export from a `BottomSheet` list of the last 12 months
   (bg-BG labels).
3. **Household-scoped.** The report always covers the full household, ignoring the
   Аз/Домакинство toggle on Insights. A monthly household report is the natural
   unit (same fixed-scope convention as the Day 14 AI summary and Day 15 budgets).
4. **Contents:** logo header + month total + % vs last month, category-breakdown
   **donut** (CSS `conic-gradient`, no chart lib), 6-month trend bars, top merchants,
   budget vs actual, flagged anomalies, and the AI summary text. See Contents below.
5. **AI summary is included only for the current month.** It reuses the already
   session-cached Day 14 summary text. Exporting a *past* month omits the summary
   rather than firing a fresh Gemini call per export — respects the Day 14
   ~1-call/session policy and keeps exports free.
6. **Dark, brand-matched PDF.** The template uses the app's design tokens
   (`#121316` background, `#adc7ff` primary, category colors) rather than a
   print-white theme. It is a digital artifact shared via the share sheet, and the
   dark brand look is the stronger portfolio piece.
7. **New deps `expo-print` + `expo-sharing`** are free, first-party Expo packages —
   no paid-dep concern. `expo-file-system` is already installed.

## Deferred (out of scope for Day 16)

- **FastAPI / Cloud Run PDF service.** The `generateReportPdf` seam is designed for
  this swap; the backend itself is a later slice (also unlocks the server-side
  Gemini move noted in CLAUDE.md).
- **Scheduled auto-generation** ("on the 1st of each month, generate last month's
  report"). This belongs to the Cloud Run phase: a real server-side monthly cron
  that pushes/emails the PDF. It is intentionally **not** built client-side — with no
  backend the only client trigger is "first app open in the new month," which is
  unreliable (won't fire if the app isn't opened) and a poor fit for a scheduled
  deliverable. Captured here so it lands with the backend.
- **Per-person / personal reports.** Household-only for v1.
- **Light/print-optimized theme.** Dark only for v1.

---

## Data layer — the swappable seam

No database or schema changes. The report reads from the same in-memory stores the
Insights screen already uses (transactions, categories, budgets, anomalies), so an
export triggers **0 extra DB reads**.

### `features/reports/types.ts`
`ReportData` — a plain, JSON-serializable object. This **is** the payload a future
Cloud Run service would receive, so it holds finished numbers (integer cents) and
display strings, not React state:

```ts
interface ReportData {
  householdName: string;
  monthLabel: string;          // bg-BG, e.g. "Юни 2026"
  monthISO: string;            // "2026-06" — for filename + dedup
  totalCents: number;
  pctVsPrevMonth: number | null;
  categories: { name: string; color: string; totalCents: number; fraction: number }[];
  trend: { label: string; totalCents: number; fraction: number; isCurrent: boolean }[];
  merchants: { merchant: string; totalCents: number }[];
  budgets: { name: string; color: string; budgetCents: number; spentCents: number;
             pct: number; state: 'under' | 'warning' | 'over' }[];
  anomalies: { merchant: string; amountCents: number; reason: string }[];
  aiSummary: string | null;    // present only when exporting the current month
}
```

### `features/reports/reportData.ts` (pure, tested)
`buildReportData(input): ReportData`. Given the loaded transactions, categories,
budget rows, open anomalies, the target month, household name, and optional cached
summary text, it:
- filters transactions to the target month (`filterByDateBounds` with month bounds),
- computes the total (`sumCents`) and % vs the previous month (`pctChange`),
- category breakdown (`categoryBreakdown`), 6-month trend (`monthlyTrend`, anchored
  to the target month), top merchants (`topMerchants`),
- budget vs actual (`resolveBudgetsForMonth` + `budgetProgress`) — always the
  target month, household spend,
- the month's flagged anomalies (from the open-anomalies list, matched to the
  month's transactions),
- sets `aiSummary` to the cached text **only when the target month is the current
  month**, else `null`.

All existing helpers are reused unchanged. This module is pure and fully unit-tested.

### `features/reports/reportHtml.ts` (pure, tested)
`buildReportHtml(data: ReportData): string`. Renders the dark-themed HTML/CSS
document:
- **Header** — embedded logo (base64), household name, month label, big total,
  colored % vs last month.
- **Category donut** — a CSS `conic-gradient` circle with a centered hole, segments
  sized by each category's fraction using its own color, plus a legend with amounts.
  No chart library (consistent with charts-deferred).
- **6-month trend** — flexbox bar row, current month highlighted.
- **Top merchants** — ranked rows with amounts.
- **Budget vs actual** — progress bars colored by `state`
  (under `#adc7ff` / warning `#ffdfa7` / over `#ffb4ab`).
- **Anomalies** — lime (`#c3f400`) accented list, omitted when empty.
- **AI summary** — accent-line block, omitted when `null`.

**All interpolated strings (merchant, category, household names, summary) are
HTML-escaped** to avoid breaking the markup or injection. Pure string output → unit
-testable.

### `features/reports/logo.ts`
Exports the Teftera logo as an embedded base64 `data:` URI so the PDF is
self-contained (asset/remote URLs are unreliable inside the print webview). Sourced
from `assets/logo.png` (committed with this slice).

### `features/reports/generatePdf.ts` (IO — the swap point)
`generateReportPdf(data: ReportData): Promise<string>` returns a local file URI.
Client implementation: `Print.printToFileAsync({ html: buildReportHtml(data) })`.
**This is the only function that changes for the Cloud Run migration** (it becomes a
`fetch` POST of `data` returning the PDF written to a file). Nothing upstream moves.

### `features/reports/export.ts` (IO orchestrator)
`exportMonthlyReport(input): Promise<void>`:
1. `buildReportData(input)`; if the month has no transactions, throw a typed
   `EmptyMonthError` (the caller shows "Няма данни за този месец", no file made).
2. `generateReportPdf(data)`.
3. If `Sharing.isAvailableAsync()`, `Sharing.shareAsync(uri, { mimeType:
   'application/pdf', UTI: 'com.adobe.pdf' })`; else surface the saved file path.
Wrapped in try/catch by the caller — a print/share failure alerts and never crashes.

---

## UX flow (`app/(app)/insights.tsx`)

- **Export control:** a small icon button (`ios-share`) at the top-right, aligned
  with the "Анализи" title. Insights is a tab screen, so this is **not** a
  `FloatingActionBar` (that component is for non-tab screens) — an inline header icon
  fits the design system. Hidden while the empty state shows (nothing to export).
- Tap → **month-picker `BottomSheet`** listing the last 12 months (bg-BG labels,
  current month first). Pick a month → the button/sheet shows a "Генериране…" busy
  state → `exportMonthlyReport` → native share sheet.
- **Empty month** (`EmptyMonthError`) → `Alert` "Няма данни за този месец", no file.
- **Failure** (print or share) → `Alert` "Неуспешно генериране на PDF", no crash. If
  sharing is unavailable, the alert reports the saved file path instead.

---

## Testing

Pure unit tests (Jest), matching the existing slices:
- `buildReportData` — month filtering to the correct bounds; totals and % vs prev
  month in integer cents; AI summary present only for the current month; anomalies
  scoped to the month; empty-month result.
- `buildReportHtml` — output contains the expected totals/labels; HTML-escaping of a
  merchant name containing `<`, `&`, `"`; donut segments sum to ~100%; optional
  sections (anomalies, AI summary) omitted when their data is absent.

The IO layer (`generatePdf`, `export`) and the screen wiring stay thin and are
covered by the on-device checkpoint. `expo-print`/`expo-sharing` are not unit-tested.

---

## Checkpoint (from the build plan)

Tap Export on Insights → pick a month → receive a branded PDF with real data for
that month (total, category donut, top merchants, budget vs actual, logo) via the
share sheet.

## File map

```
features/reports/
  types.ts          ReportData payload shape
  reportData.ts     buildReportData         (pure, tested — reuses aggregations)
  reportHtml.ts     buildReportHtml         (pure, tested — dark HTML + donut)
  generatePdf.ts    generateReportPdf       (IO — the Cloud Run swap seam)
  export.ts         exportMonthlyReport     (IO orchestrator: data→pdf→share)
  logo.ts           base64 Teftera logo
assets/logo.png     committed logo source
```

Edits: `app/(app)/insights.tsx` (Export icon + month-picker sheet + busy/error
handling). New deps in `package.json`: `expo-print`, `expo-sharing`.

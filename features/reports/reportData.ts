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

// features/reports/reportData.ts
import { sumCents, monthlyTrend, topMerchants } from '@/features/insights/aggregate';
import { pctChange, categoryBreakdown } from '@/features/transactions/dashboard';
import { filterByDateBounds } from '@/features/insights/range';
import { monthBudgetProgress } from '@/features/budgets/currentMonth';
import { expensesOnly, incomeOnly } from '@/features/transactions/kind';
import { monthBounds, monthKey, startOfMonth, sumInMonth } from '@/lib/dates';
import type { BuildReportInput, MonthOption, ReportData } from './types';

function monthLabelOf(d: Date): string {
  const s = new Intl.DateTimeFormat('bg-BG', { month: 'long', year: 'numeric' }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function buildReportData(input: BuildReportInput): ReportData {
  const now = input.now ?? new Date();
  const { month } = input;
  const { startISO, endISO } = monthBounds(month);
  const monthTxs = filterByDateBounds(input.transactions, startISO, endISO);
  const expenseMonthTxs = expensesOnly(monthTxs);

  const totalCents = sumCents(expenseMonthTxs);

  const prevTotal = sumInMonth(expensesOnly(input.transactions), startOfMonth(month, -1));
  const pctVsPrevMonth = pctChange(totalCents, prevTotal);

  const catRows = categoryBreakdown(expenseMonthTxs, input.categories);
  const categories = catRows.map((c) => ({
    name: c.name,
    color: c.color,
    totalCents: c.totalCents,
    share: totalCents > 0 ? c.totalCents / totalCents : 0,
  }));

  const trend = monthlyTrend(expensesOnly(input.transactions), 6, month).map((t) => ({
    label: t.label,
    fraction: t.fraction,
    isCurrent: t.isCurrent,
  }));

  const merchants = topMerchants(expenseMonthTxs, 5);

  const incomeTotalCents = sumCents(incomeOnly(monthTxs));

  const catById = new Map(input.categories.map((c) => [c.id, c]));
  const budgets = monthBudgetProgress(input.budgetRows, catRows, month).map((b) => {
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

  const monthTxById = new Map(expenseMonthTxs.map((t) => [t.id, t]));
  const anomalies = input.openAnomalies
    .filter((a) => monthTxById.has(a.transactionId))
    .map((a) => {
      const t = monthTxById.get(a.transactionId)!;
      return { merchant: t.merchant, amountCents: t.amount_eur, reason: a.reason };
    });

  const isCurrentMonth = monthKey(month) === monthKey(now);
  const aiSummary = isCurrentMonth ? (input.aiSummaryText ?? null) : null;

  return {
    monthLabel: monthLabelOf(month),
    monthISO: monthKey(month),
    totalCents,
    pctVsPrevMonth,
    categories,
    trend,
    merchants,
    budgets,
    anomalies,
    aiSummary,
    incomeTotalCents,
  };
}

export function monthPickerOptions(now: Date = new Date(), count = 12): MonthOption[] {
  const out: MonthOption[] = [];
  for (let i = 0; i < count; i++) {
    const d = startOfMonth(now, -i);
    out.push({ monthISO: monthKey(d), label: monthLabelOf(d), date: d });
  }
  return out;
}

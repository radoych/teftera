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

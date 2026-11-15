// features/insights/deriveInsights.ts — every number the Insights screen renders,
// as one pure function of in-memory store data + the screen's controls.
import type { OpenAnomaly } from '@/features/anomalies/api';
import { currentMonthBudgetProgress } from '@/features/budgets/currentMonth';
import type { BudgetProgress, BudgetRow } from '@/features/budgets/types';
import {
  categoryBreakdown,
  filterByUser,
  pctChange,
  type CategorySpend,
} from '@/features/transactions/dashboard';
import { expensesOnly, incomeOnly } from '@/features/transactions/kind';
import type { CategoryLite, Transaction } from '@/features/transactions/types';
import {
  monthlyTrend,
  sumCents,
  topMerchants,
  type MerchantSpend,
  type TrendMonth,
} from './aggregate';
import { comparisonRange, filterByDateBounds, filterByRange, type TimeRange } from './range';

export type InsightsScope = 'me' | 'household';

/** Months shown in the trend bars (oldest→newest, ending at `now`'s month). */
export const TREND_MONTHS = 6;
/** Merchants shown in the top-merchants list. */
export const TOP_MERCHANTS = 5;

export interface InsightsInput {
  /** All household transactions (expense + income) from the store. */
  transactions: Transaction[];
  categories: CategoryLite[];
  openAnomalies: OpenAnomaly[];
  budgets: BudgetRow[];
  /** Signed-in user; used only when `scope === 'me'`. */
  userId: string | null;
  /** Person pill. Applies to hero, comparison, categories, trend and merchants — NOT budgets. */
  scope: InsightsScope;

  // --- The three time bases -------------------------------------------------
  /**
   * Time base 1 — the range pills. Selects the calendar-aligned window (anchored
   * at `now`) for the hero total, income line, comparison, category breakdown and
   * top merchants. The comparison is the equal-length window immediately before.
   */
  range: TimeRange;
  /**
   * Time base 2 — the screen clock (refreshed on focus / pull-to-refresh). Anchors
   * the range window above, and on its own drives the monthly trend: always the
   * last `TREND_MONTHS` calendar months ending at `now`'s month, whatever `range` is.
   */
  now: Date;
  /**
   * Time base 3 — the budget month. Budget-vs-actual is always one calendar month
   * (the one containing this date) for the WHOLE household: neither `range` nor
   * `scope` affects it.
   */
  budgetMonth: Date;
}

export interface InsightsHero {
  /** Expense total in the range window, cents. */
  totalCents: number;
  /** Income total in the range window, cents (same scope). */
  incomeCents: number;
  /** % change vs the preceding equal-length window; null when that window is empty. */
  comparisonPct: number | null;
}

export interface InsightsAnomalyCard {
  id: string;
  transactionId: string;
  merchant: string;
  amountCents: number;
  reason: string;
}

export interface InsightsData {
  hero: InsightsHero;
  categoryRows: CategorySpend[];
  trend: TrendMonth[];
  merchants: MerchantSpend[];
  budgetRows: BudgetProgress[];
  categoryById: Map<string, CategoryLite>;
  /** Open anomalies joined to their transaction; anomalies whose tx is gone are dropped. */
  anomalyCards: InsightsAnomalyCard[];
}

export function deriveInsights(input: InsightsInput): InsightsData {
  const { transactions, categories, range, now } = input;
  const scopedUser = input.scope === 'me' ? input.userId : null;

  const expenses = expensesOnly(transactions);
  const personExpenses = filterByUser(expenses, scopedUser);
  const inRange = filterByRange(personExpenses, range, now);

  const totalCents = sumCents(inRange);
  const prev = comparisonRange(range, now);
  const comparisonPct = pctChange(
    totalCents,
    sumCents(filterByDateBounds(personExpenses, prev.startISO, prev.endISO)),
  );
  const incomeCents = sumCents(
    filterByRange(filterByUser(incomeOnly(transactions), scopedUser), range, now),
  );

  const txById = new Map(transactions.map((t) => [t.id, t]));
  const anomalyCards: InsightsAnomalyCard[] = [];
  for (const a of input.openAnomalies) {
    const t = txById.get(a.transactionId);
    if (!t) continue;
    anomalyCards.push({
      id: a.id,
      transactionId: a.transactionId,
      merchant: t.merchant,
      amountCents: t.amount_eur,
      reason: a.reason,
    });
  }

  return {
    hero: { totalCents, incomeCents, comparisonPct },
    categoryRows: categoryBreakdown(inRange, categories),
    trend: monthlyTrend(personExpenses, TREND_MONTHS, now),
    merchants: topMerchants(inRange, TOP_MERCHANTS),
    budgetRows: currentMonthBudgetProgress({
      transactions: expenses,
      categories,
      budgets: input.budgets,
      now: input.budgetMonth,
    }),
    categoryById: new Map(categories.map((c) => [c.id, c])),
    anomalyCards,
  };
}

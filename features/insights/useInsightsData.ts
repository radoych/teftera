// features/insights/useInsightsData.ts — memoised store → InsightsData for the screen.
import { useMemo } from 'react';
import { useAuthStore } from '@/features/auth/store';
import { useBudgetsStore } from '@/features/budgets/store';
import { useTransactionsStore } from '@/features/transactions/store';
import { deriveInsights, type InsightsData, type InsightsScope } from './deriveInsights';
import type { TimeRange } from './range';

/**
 * One memo around `deriveInsights` (every input is already in memory and the whole
 * derivation is ~1 ms, so fine-grained memos aren't worth their dependency arrays).
 * The budget month is the screen clock's month: budgets ignore `range`/`scope`.
 */
export function useInsightsData(range: TimeRange, scope: InsightsScope, now: Date): InsightsData {
  const transactions = useTransactionsStore((s) => s.transactions);
  const categories = useTransactionsStore((s) => s.categories);
  const openAnomalies = useTransactionsStore((s) => s.openAnomalies);
  const budgets = useBudgetsStore((s) => s.rows);
  const userId = useAuthStore((s) => s.session?.user.id ?? null);

  return useMemo(
    () =>
      deriveInsights({
        transactions,
        categories,
        openAnomalies,
        budgets,
        userId,
        scope,
        range,
        now,
        budgetMonth: now,
      }),
    [transactions, categories, openAnomalies, budgets, userId, scope, range, now],
  );
}

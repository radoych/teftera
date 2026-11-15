// features/budgets/runBudgetCheck.ts
import type { Transaction } from '@/features/transactions/types';
import type { CategoryLite } from '@/features/transactions/groupByDay';
import { firstOfMonth } from '@/lib/dates';
import { formatCurrency } from '@/lib/formatCurrency';
import { currentMonthBudgetProgress } from './currentMonth';
import { hasAlerted, markerKey, recordAlerted } from './alertStore';
import { sendBudgetNotification } from './notify';
import type { BudgetRow } from './types';

export interface RunBudgetCheckInput {
  householdId: string;
  savedCategoryId: string | null;
  alertsEnabled: boolean;
  transactions: Transaction[];
  categories: CategoryLite[];
  budgets: BudgetRow[];
  now?: Date;
}

export interface RunBudgetCheckDeps {
  hasAlerted: typeof hasAlerted;
  recordAlerted: typeof recordAlerted;
  notify: typeof sendBudgetNotification;
}

const defaultDeps: RunBudgetCheckDeps = { hasAlerted, recordAlerted, notify: sendBudgetNotification };

/**
 * After a save, fire a local notification if the saved transaction's category
 * just crossed 80% or 100% of its budget. Best-effort: never throws. Reads only
 * from in-memory inputs — no DB I/O.
 */
export async function runBudgetCheck(
  input: RunBudgetCheckInput,
  deps: RunBudgetCheckDeps = defaultDeps,
): Promise<void> {
  try {
    if (!input.alertsEnabled || input.savedCategoryId === null) return;
    const now = input.now ?? new Date();
    const month = firstOfMonth(now);
    const rows = currentMonthBudgetProgress({
      transactions: input.transactions,
      categories: input.categories,
      budgets: input.budgets,
      now,
    });
    const row = rows.find((r) => r.categoryId === input.savedCategoryId);
    if (!row) return;

    const threshold: 80 | 100 | null = row.state === 'over' ? 100 : row.state === 'warning' ? 80 : null;
    if (threshold === null) return;

    const key = markerKey(input.householdId, input.savedCategoryId, month, threshold);
    if (await deps.hasAlerted(key)) return;

    const cat = input.categories.find((c) => c.id === input.savedCategoryId);
    const name = cat?.name ?? 'Категория';
    const title = threshold === 100 ? 'Бюджетът е надхвърлен' : 'Бюджетът наближава';
    const body = `${name} — ${formatCurrency(row.spentCents)} от ${formatCurrency(row.budgetCents)} (${row.pct}%)`;
    await deps.notify({ title, body });
    await deps.recordAlerted(key);
  } catch (err) {
    if (__DEV__) console.warn('[budgets] check failed', err);
  }
}

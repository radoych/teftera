// features/transactions/afterSave.ts — what happens after a transaction is saved.
import { runDetection } from '@/features/anomalies/runDetection';
import { runBudgetCheck } from '@/features/budgets/runBudgetCheck';
import { useBudgetsStore } from '@/features/budgets/store';
import type { BudgetRow } from '@/features/budgets/types';
import { usePreferencesStore } from '@/features/preferences/store';
import { recordVendor } from '@/features/vendors/save';
import type { CategoryLite } from './groupByDay';
import type { TxKind } from './kind';
import { useTransactionsStore } from './store';
import { refreshTransactions } from './sync';
import type { Transaction } from './types';

export interface AfterSaveInput {
  householdId: string;
  /** Id of a newly created row; `null` after an edit (edits only refresh). */
  transactionId: string | null;
  kind: TxKind;
  amountCents: number;
  categoryId: string | null;
  merchant: string;
  /**
   * Receipt flow only: the raw merchant Gemini read off the receipt. When it
   * differs from `merchant` it is learned as a recognized name of the vendor.
   */
  extractedMerchant?: string;
}

/** Store + preference state the post-save steps read, taken after the refresh. */
export interface AfterSaveSnapshot {
  transactions: Transaction[];
  categories: CategoryLite[];
  budgets: BudgetRow[];
  anomalyAlertsEnabled: boolean;
  budgetAlertsEnabled: boolean;
}

/**
 * Every side effect `runAfterSave` performs, injectable for tests. A new
 * post-save step (e.g. vendor alias learning) is one more field here plus one
 * more `step(...)` line in `runAfterSave`.
 */
export interface AfterSaveDeps {
  refresh: (householdId: string) => Promise<void>;
  snapshot: () => AfterSaveSnapshot;
  detect: typeof runDetection;
  budgetCheck: typeof runBudgetCheck;
  /** Ensure the merchant's vendor exists + learn a receipt alias (features/vendors). */
  vendor: typeof recordVendor;
}

function readSnapshot(): AfterSaveSnapshot {
  const { transactions, categories } = useTransactionsStore.getState();
  const { preferences } = usePreferencesStore.getState();
  return {
    transactions,
    categories,
    budgets: useBudgetsStore.getState().rows,
    anomalyAlertsEnabled: preferences.anomalyAlertsEnabled ?? true,
    budgetAlertsEnabled: preferences.budgetAlertsEnabled ?? true,
  };
}

export const defaultAfterSaveDeps: AfterSaveDeps = {
  refresh: refreshTransactions,
  snapshot: readSnapshot,
  detect: runDetection,
  budgetCheck: runBudgetCheck,
  vendor: recordVendor,
};

/** Run one best-effort step; a failure is logged in dev and never propagates. */
async function step(name: string, fn: () => Promise<void>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (err) {
    if (__DEV__) console.warn(`[afterSave] ${name} failed`, err);
    return false;
  }
}

/**
 * Post-save orchestration shared by every entry screen: refresh the store,
 * vendor bookkeeping (every save), then — for a newly created expense —
 * anomaly detection and the budget alert check. Best-effort and never throws: the save already succeeded, so nothing
 * here may invite a retry that would double-insert.
 *
 * Rules (enforced here, not per screen):
 * - the vendor step runs for every save (edits and income too) and does not
 *   depend on the transactions refresh;
 * - edits (`transactionId === null`) otherwise only refresh;
 * - detection and budget checks run only for `kind === 'expense'`;
 * - if the refresh fails the store-dependent steps are skipped (they would
 *   read stale data); the list reconciles on the next realtime event / focus.
 */
export async function runAfterSave(
  input: AfterSaveInput,
  deps: AfterSaveDeps = defaultAfterSaveDeps,
): Promise<void> {
  const refreshed = await step('refresh', () => deps.refresh(input.householdId));

  await step('vendor', () =>
    deps.vendor({
      householdId: input.householdId,
      merchant: input.merchant,
      extractedMerchant: input.extractedMerchant,
    }),
  );

  if (!refreshed) return;

  const { transactionId } = input;
  if (transactionId === null || input.kind !== 'expense') return;

  const snap = deps.snapshot();

  await step('detection', () =>
    deps.detect({
      transactionId,
      householdId: input.householdId,
      amountCents: input.amountCents,
      categoryId: input.categoryId,
      transactions: snap.transactions,
      merchant: input.merchant,
      alertsEnabled: snap.anomalyAlertsEnabled,
    }),
  );

  await step('budget check', () =>
    deps.budgetCheck({
      householdId: input.householdId,
      savedCategoryId: input.categoryId,
      alertsEnabled: snap.budgetAlertsEnabled,
      transactions: snap.transactions,
      categories: snap.categories,
      budgets: snap.budgets,
    }),
  );
}

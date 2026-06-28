import type { Transaction } from '@/features/transactions/types';
import { evaluate, historyForCategory } from './detect';
import { flagTransaction, insertAnomaly } from './api';

export interface RunDetectionInput {
  transactionId: string;
  householdId: string;
  amountCents: number;
  categoryId: string | null;
  transactions: Transaction[];
}

export interface RunDetectionDeps {
  flagTransaction: typeof flagTransaction;
  insertAnomaly: typeof insertAnomaly;
}

const defaultDeps: RunDetectionDeps = { flagTransaction, insertAnomaly };

/**
 * Score a just-saved transaction against its category history and persist a flag
 * if it is anomalous. Best-effort: never throws — a failure here must not break
 * the save that already succeeded.
 */
export async function runDetection(
  input: RunDetectionInput,
  deps: RunDetectionDeps = defaultDeps,
): Promise<void> {
  try {
    const history = historyForCategory(input.transactions, input.categoryId, input.transactionId);
    const result = evaluate(input.amountCents, history);
    if (!result.isAnomaly || result.reason === null) return;
    await deps.flagTransaction(input.transactionId);
    await deps.insertAnomaly({
      householdId: input.householdId,
      transactionId: input.transactionId,
      reason: result.reason,
      score: result.score,
    });
  } catch (err) {
    if (__DEV__) console.warn('[anomaly] detection failed', err);
  }
}

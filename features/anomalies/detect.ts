import { scoreTransaction, type AnomalyResult } from '@/services/anomaly';
import type { Transaction } from '@/features/transactions/types';

/** `amount_eur` of household txs in the same category, excluding the scored tx. */
export function historyForCategory(
  txs: Transaction[],
  categoryId: string | null,
  excludeId: string,
): number[] {
  return txs
    .filter((tx) => tx.id !== excludeId && tx.category_id === categoryId)
    .map((tx) => tx.amount_eur);
}

/** Score one amount against a category's historical amounts (delegates to the engine). */
export function evaluate(amountCents: number, history: number[]): AnomalyResult {
  return scoreTransaction(amountCents, history);
}

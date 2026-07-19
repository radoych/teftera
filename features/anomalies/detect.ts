import { scoreTransaction, type AnomalyResult } from '@/services/anomaly';
import type { Transaction } from '@/features/transactions/types';

/**
 * `amount_eur` of household expense txs in the same category, excluding the
 * scored tx. Income rows never enter the history. When `sinceISO` is given,
 * rows dated earlier are excluded (keeps stale, pre-window spending out of
 * the comparison).
 */
export function historyForCategory(
  txs: Transaction[],
  categoryId: string | null,
  excludeId: string,
  sinceISO?: string,
): number[] {
  return txs
    .filter(
      (tx) =>
        tx.id !== excludeId &&
        tx.category_id === categoryId &&
        tx.kind === 'expense' &&
        (sinceISO === undefined || tx.date >= sinceISO),
    )
    .map((tx) => tx.amount_eur);
}

/** Score one amount against a category's historical amounts (delegates to the engine). */
export function evaluate(amountCents: number, history: number[]): AnomalyResult {
  return scoreTransaction(amountCents, history);
}

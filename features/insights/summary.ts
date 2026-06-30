import { generateInsightsSummary } from '@/services/gemini';
import type { CategoryLite } from '@/features/transactions/groupByDay';
import type { Transaction } from '@/features/transactions/types';
import { buildSummaryInput } from './summaryInput';
import { useSummaryStore } from './summaryStore';

export interface RefreshSummaryDeps {
  generate: typeof generateInsightsSummary;
  setLoading: () => void;
  setReady: (text: string) => void;
  setError: () => void;
}

function defaultDeps(): RefreshSummaryDeps {
  const s = useSummaryStore.getState();
  return {
    generate: generateInsightsSummary,
    setLoading: s.setLoading,
    setReady: s.setReady,
    setError: s.setError,
  };
}

/**
 * Build the current-month snapshot, generate the summary, and write the result to
 * the store. Best-effort: a `null` result or a thrown error both land on `error`
 * (which hides the card). Never throws.
 *
 * Short-circuits to the hidden state (error) without calling Gemini or flashing
 * the loading state when there is no current-month spend.
 */
export async function refreshSummary(
  txs: Transaction[],
  categories: CategoryLite[],
  deps: RefreshSummaryDeps = defaultDeps(),
): Promise<void> {
  const input = buildSummaryInput(txs, categories);
  if (input.monthTotalCents === 0) {
    // No current-month spend → keep the summary card hidden; don't call Gemini.
    deps.setError();
    return;
  }
  deps.setLoading();
  try {
    const text = await deps.generate(input);
    if (text) deps.setReady(text);
    else deps.setError();
  } catch {
    deps.setError();
  }
}

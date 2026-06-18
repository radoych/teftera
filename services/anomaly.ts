/**
 * Anomaly detection — pure, testable scoring. Isolated here so it can move to a
 * server-side model later without touching the app.
 *
 * v1: simple per-category Z-score over historical amounts (in EUR cents).
 */

export interface AnomalyResult {
  score: number;
  isAnomaly: boolean;
  reason: string | null;
}

const DEFAULT_THRESHOLD = 2.5;
const MIN_SAMPLE = 4;

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance =
    values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function zScore(value: number, history: number[]): number {
  const sd = stdDev(history);
  if (sd === 0) return 0;
  return (value - mean(history)) / sd;
}

/**
 * Score one transaction amount against the category's historical amounts.
 * Returns a flag + human reason. Below the minimum sample size we never flag.
 */
export function scoreTransaction(
  amountCents: number,
  history: number[],
  threshold = DEFAULT_THRESHOLD,
): AnomalyResult {
  if (history.length < MIN_SAMPLE) {
    return { score: 0, isAnomaly: false, reason: null };
  }

  const z = zScore(amountCents, history);
  const isAnomaly = Math.abs(z) >= threshold;
  const avg = mean(history);

  return {
    score: Number(z.toFixed(2)),
    isAnomaly,
    reason: isAnomaly
      ? `${amountCents > avg ? 'Над' : 'Под'} обичайното за тази категория (z=${z.toFixed(1)})`
      : null,
  };
}

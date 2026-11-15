import type { AnomalyDirection } from '@/services/anomaly';
import type { OpenAnomaly } from './api';

/** The user-facing (and persisted `anomalies.reason`) text for a flagged amount. */
export function anomalyReasonText(direction: AnomalyDirection, z: number): string {
  return `${direction === 'over' ? 'Над' : 'Под'} обичайното за тази категория (z=${z.toFixed(1)})`;
}

/** Map transactionId → reason for the open anomalies (drives the row's flagReason). */
export function reasonByTxId(open: OpenAnomaly[]): Map<string, string> {
  return new Map(open.map((a) => [a.transactionId, a.reason]));
}

import type { OpenAnomaly } from './api';

/** Map transactionId → reason for the open anomalies (drives the row's flagReason). */
export function reasonByTxId(open: OpenAnomaly[]): Map<string, string> {
  return new Map(open.map((a) => [a.transactionId, a.reason]));
}

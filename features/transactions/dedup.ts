// features/transactions/dedup.ts — pure import-deduplication helpers.
import type { Transaction } from './types';

/** Minimal shape a candidate needs for dedup. */
export interface DedupCandidate {
  date: string; // YYYY-MM-DD
  amountEurCents: number;
  merchant: string;
}

/** Normalized dedup key: date + EUR cents + case/space-insensitive merchant. */
export function importKey(date: string, amountEurCents: number, merchant: string): string {
  return `${date}|${amountEurCents}|${merchant.trim().toLowerCase()}`;
}

/**
 * Partition candidates into those not already in the DB (`toImport`) and those
 * matching an existing transaction (`duplicates`). Matching is on
 * date + amount + merchant against `existing` only — identical rows within a
 * single batch are both kept.
 */
export function dedupeImport<T extends DedupCandidate>(
  candidates: T[],
  existing: Transaction[],
): { toImport: T[]; duplicates: T[] } {
  const existingKeys = new Set(
    existing.map((t) => importKey(t.date, t.amount_eur, t.merchant)),
  );
  const toImport: T[] = [];
  const duplicates: T[] = [];
  for (const c of candidates) {
    if (existingKeys.has(importKey(c.date, c.amountEurCents, c.merchant))) {
      duplicates.push(c);
    } else {
      toImport.push(c);
    }
  }
  return { toImport, duplicates };
}

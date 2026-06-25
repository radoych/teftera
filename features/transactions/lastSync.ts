// features/transactions/lastSync.ts — helpers for showing the last DSK import timestamp.
import { relativeDay, formatTime, toISODate } from '@/lib/dates';
import type { Transaction } from './types';

/**
 * Returns the maximum `created_at` ISO string among transactions whose
 * `source === 'dsk_import'`, or `null` if no such transactions exist.
 */
export function lastDskSyncAt(txs: Transaction[]): string | null {
  let latest: string | null = null;
  for (const tx of txs) {
    if (tx.source !== 'dsk_import') continue;
    if (latest === null || tx.created_at > latest) {
      latest = tx.created_at;
    }
  }
  return latest;
}

/**
 * Formats a last-sync ISO timestamp for display in bg-BG.
 *
 * - `null`  → `'Никога'`
 * - today   → `'Днес 14:30'`
 * - yesterday → `'Вчера 09:05'`
 * - older   → `'23 фев 2026 14:30'`
 */
export function formatLastSync(iso: string | null, now?: Date): string {
  if (iso === null) return 'Никога';
  const date = new Date(iso);
  const dayLabel = relativeDay(toISODate(date), now);
  const timeLabel = formatTime(date);
  return `${dayLabel} ${timeLabel}`;
}

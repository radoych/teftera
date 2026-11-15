// features/shopping/copy.ts — Bulgarian strings that depend on counts (spec §10). Pure.
import type { ListCounts } from './types';

/** Index / dashboard row meta: "{n} за вземане" / "Готово" / "Празен". */
export function listMetaLabel(counts: ListCounts): string {
  if (counts.total === 0) return 'Празен';
  return counts.open > 0 ? `${counts.open} за вземане` : 'Готово';
}

/** "Изчисти взетите" confirm title. */
export const clearDoneTitle = (n: number): string =>
  n === 1 ? 'Премахване на 1 взет продукт?' : `Премахване на ${n} взети продукта?`;

/** ListProgress counter: "3 / 8". */
export const progressLabel = (counts: ListCounts): string => `${counts.done} / ${counts.total}`;

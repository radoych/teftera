/**
 * DSK Bank (Bulgaria) CSV import + ETL normalization.
 *
 * Pre-2026 statements are in BGN. We store `amount_eur` (cents) as the canonical
 * value and retain `original_amount` + `original_currency` for provenance.
 * Fixed conversion rate lives in formatCurrency.ts.
 */
import { bgnToEurCents } from '@/lib/formatCurrency';
import { guessCategory } from '@/lib/categories';

export interface DskRawRow {
  /** Bulgarian-formatted amount, e.g. "1 234,56" or "-45,00". */
  amount: string;
  date: string; // dd.mm.yyyy as exported by DSK
  description: string;
}

export interface NormalizedTransaction {
  amountEurCents: number;
  originalAmountCents: number;
  originalCurrency: 'BGN';
  merchant: string;
  categoryGuess: string;
  date: string; // YYYY-MM-DD
}

/** Parse a Bulgarian decimal string ("1 234,56") into integer minor units. */
export function parseBgAmount(raw: string): number {
  const cleaned = raw
    .replace(/ /g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '') // thousands separator (if dot used)
    .replace(',', '.');
  const value = Number(cleaned);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

/** Convert DSK's dd.mm.yyyy to ISO YYYY-MM-DD. */
export function parseDskDate(raw: string): string {
  const m = raw.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return raw;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

/** Collapse whitespace and trim a raw merchant/description string. */
export function cleanMerchant(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** Normalize one raw DSK row into a transaction draft (BGN → EUR). */
export function normalizeDskRow(row: DskRawRow): NormalizedTransaction {
  const originalAmountCents = Math.abs(parseBgAmount(row.amount));
  const merchant = cleanMerchant(row.description);
  return {
    amountEurCents: bgnToEurCents(originalAmountCents),
    originalAmountCents,
    originalCurrency: 'BGN',
    merchant,
    categoryGuess: guessCategory(merchant),
    date: parseDskDate(row.date),
  };
}

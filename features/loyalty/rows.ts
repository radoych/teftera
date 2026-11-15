// features/loyalty/rows.ts — narrow raw `loyalty_cards` rows / errors to the app's types. Pure.
import type { BarcodeFormat } from '@/lib/barcode';
import type { Tables } from '@/supabase/types';
import { detectCodeFormat } from './format';
import type { LoyaltyCard } from './types';

const FORMATS: readonly BarcodeFormat[] = ['ean13', 'ean8', 'code128', 'qr'];

const isBarcodeFormat = (value: string): value is BarcodeFormat =>
  (FORMATS as readonly string[]).includes(value);

/**
 * `code_format` is text in Postgres (a check constraint guards it). Known
 * values pass through; anything else is re-detected from the code itself so
 * the card still renders something scannable.
 */
export function parseCodeFormat(value: string, code: string): BarcodeFormat {
  return isBarcodeFormat(value) ? value : detectCodeFormat(code).format;
}

export function toLoyaltyCard(row: Tables<'loyalty_cards'>): LoyaltyCard {
  return { ...row, code_format: parseCodeFormat(row.code_format, row.code) };
}

/**
 * True for the `unique (household_id, vendor_id, nickname)` violation — the
 * table's only unique constraint besides the uuid primary key, so Postgres
 * `23505` on this table means "nickname taken for this vendor".
 */
export function isNicknameTakenError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23505'
  );
}

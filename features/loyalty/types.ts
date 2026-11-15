// features/loyalty/types.ts — the app's loyalty-card contract.
import type { BarcodeFormat } from '@/lib/barcode';
import type { Tables } from '@/supabase/types';

/**
 * One loyalty card. Derived from the `loyalty_cards` row so column changes are
 * compile errors; `code_format` is text in Postgres and narrowed here.
 * `vendor_id` null = orphan card ("Без търговец").
 */
export interface LoyaltyCard extends Omit<Tables<'loyalty_cards'>, 'code_format'> {
  code_format: BarcodeFormat;
}

/** Editable fields of a card (create adds householdId / createdBy). */
export interface CardFields {
  vendorId: string | null;
  nickname: string;
  code: string;
  codeFormat: BarcodeFormat;
  color: string;
  note: string | null;
}

/** Resolves a vendor id to its display name; undefined = unknown / not loaded. */
export type VendorNameLookup = (vendorId: string) => string | undefined;

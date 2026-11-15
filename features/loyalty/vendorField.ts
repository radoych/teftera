// features/loyalty/vendorField.ts — the card form's vendor field ↔ vendor id (save-time). Pure.
import type { EnsuredVendor } from '@/features/vendors/ensure';
import { cleanVendorName } from '@/features/vendors/key';
import type { VendorIndex } from '@/features/vendors/types';

export interface CardVendorDeps {
  /** `ensureVendorForMerchant` bound to the real API (never throws). */
  ensure: (input: { householdId: string; merchant: string; index: VendorIndex }) => Promise<EnsuredVendor>;
  refreshVendors: (householdId: string) => Promise<void>;
}

/** The vendor field's starting text: the vendor's name, or '' (none / not loaded). */
export function initialVendorText(vendorId: string | null, index: VendorIndex): string {
  return vendorId ? (index.byId.get(vendorId)?.name ?? '') : '';
}

/**
 * Turn the vendor field's text into the card's `vendor_id` at save time:
 * - untouched → the original id (kept even when its name is not loaded yet);
 * - blank → null (orphan card, "Без търговец");
 * - otherwise resolve the name / recognized name, creating a new vendor for a
 *   brand-new name (spec §7.6) and refreshing the vendors store so the card
 *   groups under it right away (best-effort; realtime catches up otherwise).
 * Rejects when no vendor could be resolved or created, so the save aborts
 * instead of silently filing the card under "Без търговец".
 */
export async function resolveCardVendorId(
  input: {
    householdId: string;
    text: string;
    initialText: string;
    initialVendorId: string | null;
    index: VendorIndex;
  },
  deps: CardVendorDeps,
): Promise<string | null> {
  const name = cleanVendorName(input.text);
  if (name === cleanVendorName(input.initialText)) return input.initialVendorId;
  if (!name) return null;

  const ensured = await deps.ensure({
    householdId: input.householdId,
    merchant: name,
    index: input.index,
  });
  if (!ensured.vendorId) throw new Error(`could not resolve or create vendor "${name}"`);
  if (ensured.created) {
    try {
      await deps.refreshVendors(input.householdId);
    } catch (err) {
      if (__DEV__) console.warn('[loyalty] vendor refresh after create failed', err);
    }
  }
  return ensured.vendorId;
}

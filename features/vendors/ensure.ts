// features/vendors/ensure.ts — make sure a saved merchant has a vendor (save-time hook).
import { isUniqueViolation } from './conflict';
import { cleanVendorName } from './key';
import { resolveVendor } from './resolve';
import type { VendorIndex } from './types';

export interface EnsureVendorDeps {
  createVendor: (input: { householdId: string; name: string }) => Promise<{ id: string }>;
  refreshVendors: (householdId: string) => Promise<void>;
  /** The index after a refresh (the input `index` is the pre-save snapshot). */
  getIndex: () => VendorIndex;
}

export interface EnsuredVendor {
  /** The name to write to `transactions.merchant`. */
  name: string;
  /** `''` when bookkeeping fell back (no vendor could be resolved or created). */
  vendorId: string;
  created: boolean;
}

/**
 * Resolve `merchant` to a vendor, creating one when it resolves to nothing.
 * A `23505` on create is a race (the other phone just created it, or the name
 * equals an existing recognized name): refresh and resolve again. Never
 * throws — saving a transaction must never be blocked by vendor bookkeeping;
 * on any failure the cleaned typed name comes back with `vendorId: ''`.
 */
export async function ensureVendorForMerchant(
  input: { householdId: string; merchant: string; index: VendorIndex },
  deps: EnsureVendorDeps,
): Promise<EnsuredVendor> {
  const name = cleanVendorName(input.merchant);
  const fallback: EnsuredVendor = { name, vendorId: '', created: false };
  if (!name) return fallback;

  const hit = resolveVendor(name, input.index);
  if (hit) return { name: hit.name, vendorId: hit.id, created: false };

  try {
    const { id } = await deps.createVendor({ householdId: input.householdId, name });
    return { name, vendorId: id, created: true };
  } catch (err) {
    if (!isUniqueViolation(err)) {
      if (__DEV__) console.warn('[vendors] create failed', err);
      return fallback;
    }
  }

  try {
    await deps.refreshVendors(input.householdId);
  } catch (err) {
    if (__DEV__) console.warn('[vendors] refresh after race failed', err);
    return fallback;
  }
  const raced = resolveVendor(name, deps.getIndex());
  return raced ? { name: raced.name, vendorId: raced.id, created: false } : fallback;
}

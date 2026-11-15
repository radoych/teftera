// features/vendors/save.ts — the real-deps wiring of the post-save vendor step.
import { addAlias, createVendor } from './api';
import { recordVendorAfterSave, type RecordVendorInput } from './afterSave';
import { ensureVendorForMerchant } from './ensure';
import { getVendorIndex } from './store';
import { refreshVendors } from './sync';

/** `runAfterSave`'s vendor step: ensure the merchant's vendor, learn a receipt alias. */
export function recordVendor(input: RecordVendorInput): Promise<void> {
  return recordVendorAfterSave(input, {
    getIndex: getVendorIndex,
    ensure: (args) =>
      ensureVendorForMerchant(args, { createVendor, refreshVendors, getIndex: getVendorIndex }),
    addAlias,
    refreshVendors,
  });
}

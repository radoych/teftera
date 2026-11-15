// features/vendors/afterSave.ts — vendor bookkeeping after a transaction is saved.
import type { EnsuredVendor } from './ensure';
import { shouldLearnAlias } from './learn';
import type { AliasSource, VendorIndex } from './types';

export interface RecordVendorInput {
  householdId: string;
  /** The merchant written to the transaction (already resolved to a vendor name when known). */
  merchant: string;
  /** Raw merchant as Gemini read it off a receipt — learned as an alias when it differs. */
  extractedMerchant?: string;
}

export interface RecordVendorDeps {
  getIndex: () => VendorIndex;
  ensure: (input: { householdId: string; merchant: string; index: VendorIndex }) => Promise<EnsuredVendor>;
  addAlias: (input: {
    householdId: string;
    vendorId: string;
    alias: string;
    source: AliasSource;
  }) => Promise<void>;
  refreshVendors: (householdId: string) => Promise<void>;
}

/**
 * Post-save vendor step (wired into `runAfterSave`): make sure the merchant
 * has a vendor (implicit creation, spec §1 #4), then learn the receipt's raw
 * merchant as a recognized name of it (§1 #5). Best-effort, never throws: a
 * `23505` while learning means the other phone learned it first, or the raw
 * string already maps elsewhere — silently skipped, never surfaced mid-save.
 */
export async function recordVendorAfterSave(
  input: RecordVendorInput,
  deps: RecordVendorDeps,
): Promise<void> {
  const ensured = await deps.ensure({
    householdId: input.householdId,
    merchant: input.merchant,
    index: deps.getIndex(),
  });
  let changed = ensured.created;

  const raw = input.extractedMerchant ?? '';
  if (ensured.vendorId && shouldLearnAlias(raw, ensured.name, deps.getIndex())) {
    try {
      await deps.addAlias({
        householdId: input.householdId,
        vendorId: ensured.vendorId,
        alias: raw,
        source: 'receipt',
      });
      changed = true;
    } catch (err) {
      if (__DEV__) console.warn('[vendors] alias learning skipped', err);
    }
  }

  if (changed) {
    try {
      await deps.refreshVendors(input.householdId);
    } catch (err) {
      if (__DEV__) console.warn('[vendors] refresh failed', err);
    }
  }
}

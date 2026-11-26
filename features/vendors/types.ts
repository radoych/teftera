// features/vendors/types.ts — vendors + recognized names (spec 2026-09-09 §6.2).

/** Where a recognized name came from. `seed` = migration backfill. */
export type AliasSource = 'manual' | 'receipt' | 'seed';

/** A household-level normalized merchant ("Kaufland"). */
export interface Vendor {
  id: string;
  household_id: string;
  name: string;
  name_key: string;
  /**
   * Category applied to new transactions that resolve to this vendor (when its
   * kind matches). `null` = none — the keyword rules decide.
   */
  default_category_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A raw name that resolves to a vendor. The vendor's own name is stored as its
 * primary alias (`is_primary`), so one unique `(household_id, alias_key)` index
 * enforces "a raw name belongs to exactly one vendor".
 */
export interface VendorAlias {
  id: string;
  household_id: string;
  vendor_id: string;
  alias: string;
  alias_key: string;
  is_primary: boolean;
  source: AliasSource;
  created_at: string;
}

/** Pre-computed lookup structures; rebuilt when the store changes. */
export interface VendorIndex {
  byId: Map<string, Vendor>;
  /** Every alias incl. primary, keyed by `alias_key`. */
  byKey: Map<string, { vendor: Vendor; alias: VendorAlias }>;
  /** Non-primary aliases only, alias ascending. */
  aliasesByVendor: Map<string, VendorAlias[]>;
}

export interface VendorSuggestion {
  vendor: Vendor;
  /** The alias the query matched; `null` = matched on the vendor name. */
  matchedAlias: VendorAlias | null;
  /** Lower is better (0 = name prefix … 5 = alias substring). */
  score: number;
}

/** A recognized name that could not be added because another row holds its key. */
export interface AliasConflict {
  attemptedAlias: string;
  aliasKey: string;
  owner: Vendor;
  /** The row that already holds the key. */
  ownerAlias: VendorAlias;
}

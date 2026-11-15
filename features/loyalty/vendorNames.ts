// features/loyalty/vendorNames.ts — THE injection point for vendor display names.
//
// The loyalty screens resolve `loyalty_cards.vendor_id` → name only through
// this hook. Until the vendors feature lands it resolves nothing, so every card
// is listed under "Без търговец". To plug the vendors store in, replace the
// body with a store-backed lookup, e.g.:
//
//   const vendors = useVendorsStore((s) => s.vendors);
//   return useMemo(() => {
//     const byId = new Map(vendors.map((v) => [v.id, v.name]));
//     return (id) => byId.get(id);
//   }, [vendors]);
import { noVendorNames } from './group';
import type { VendorNameLookup } from './types';

/** Vendor id → display name for the loyalty screens (memoised; stable identity). */
export function useVendorNameLookup(): VendorNameLookup {
  return noVendorNames;
}

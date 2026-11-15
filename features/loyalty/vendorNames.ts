// features/loyalty/vendorNames.ts — THE injection point for vendor display names.
//
// The loyalty screens resolve `loyalty_cards.vendor_id` → name only through
// this hook, backed by the vendors store. A card whose vendor is not (yet)
// known lists under "Без търговец".
import { useMemo } from 'react';
import { useVendorsStore } from '@/features/vendors/store';
import type { VendorNameLookup } from './types';

/** Vendor id → display name for the loyalty screens (memoised; stable identity). */
export function useVendorNameLookup(): VendorNameLookup {
  const vendors = useVendorsStore((s) => s.vendors);
  return useMemo(() => {
    const byId = new Map(vendors.map((v) => [v.id, v.name]));
    return (id: string) => byId.get(id);
  }, [vendors]);
}

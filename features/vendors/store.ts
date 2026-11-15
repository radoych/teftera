// features/vendors/store.ts — the household's vendors + recognized names.
import { useMemo } from 'react';
import { create } from 'zustand';
import { buildVendorIndex } from './resolve';
import type { Vendor, VendorAlias, VendorIndex } from './types';

interface VendorsState {
  vendors: Vendor[];
  aliases: VendorAlias[];
  loaded: boolean;
  setData: (vendors: Vendor[], aliases: VendorAlias[]) => void;
  reset: () => void;
}

export const useVendorsStore = create<VendorsState>((set) => ({
  vendors: [],
  aliases: [],
  loaded: false,
  setData: (vendors, aliases) => set({ vendors, aliases, loaded: true }),
  reset: () => set({ vendors: [], aliases: [], loaded: false }),
}));

// One cached index for non-React readers (save-time hooks, import normalisers),
// rebuilt only when the store's arrays change identity.
let cache: { vendors: Vendor[]; aliases: VendorAlias[]; index: VendorIndex } | null = null;

/** The current index, outside React. Cheap to call repeatedly (memoised on the store arrays). */
export function getVendorIndex(): VendorIndex {
  const { vendors, aliases } = useVendorsStore.getState();
  if (!cache || cache.vendors !== vendors || cache.aliases !== aliases) {
    cache = { vendors, aliases, index: buildVendorIndex(vendors, aliases) };
  }
  return cache.index;
}

/** The current index, inside React; re-renders when vendors or aliases change. */
export function useVendorIndex(): VendorIndex {
  const vendors = useVendorsStore((s) => s.vendors);
  const aliases = useVendorsStore((s) => s.aliases);
  return useMemo(() => buildVendorIndex(vendors, aliases), [vendors, aliases]);
}

/** Import-normaliser lookup: merchant key → vendor name (household knowledge). */
export const vendorNameForKey = (key: string): string | undefined =>
  getVendorIndex().byKey.get(key)?.vendor.name;

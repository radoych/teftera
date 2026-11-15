// features/vendors/sync.ts — load + live-sync of the household's vendors and recognized names.
import { createHouseholdSync } from '@/features/sync/householdSync';
import { useHouseholdSync } from '@/features/sync/useHouseholdSync';
import { listAliases, listVendors } from './api';
import { useVendorsStore } from './store';

/** Two realtime channels (`vendors`, `vendor_aliases`) funnel into one debounced reload. */
export const vendorsSync = createHouseholdSync({
  label: 'vendors',
  tables: ['vendors', 'vendor_aliases'],
  load: (householdId) => Promise.all([listVendors(householdId), listAliases(householdId)]),
  apply: ([vendors, aliases]) => useVendorsStore.getState().setData(vendors, aliases),
  reset: () => useVendorsStore.getState().reset(),
});

/**
 * Reload vendors + aliases. Resolves once the store holds data fetched after
 * this call — safe to await right after a write. Rejects if that fetch fails.
 */
export const refreshVendors = (householdId: string): Promise<void> =>
  vendorsSync.refresh(householdId);

/** Keep the household's vendors live. Call once, in the (app) layout. */
export const useVendorsSync = (): void => useHouseholdSync(vendorsSync);

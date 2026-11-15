// features/sync/useHouseholdSync.ts — mount a HouseholdSync for the signed-in household.
import { useEffect } from 'react';
import { useAuthStore } from '@/features/auth/store';
import type { HouseholdSync } from './householdSync';

/**
 * Start `sync` for the current household and keep it live; reset its store
 * when there is no household (signed out / left). Call once per sync, in the
 * (app) layout. `sync` must be a module-level instance (stable identity).
 */
export function useHouseholdSync(sync: HouseholdSync): void {
  const householdId = useAuthStore((s) => s.householdId);

  useEffect(() => {
    if (!householdId) {
      sync.reset();
      return;
    }
    return sync.start(householdId);
  }, [sync, householdId]);
}

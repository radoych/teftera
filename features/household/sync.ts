// features/household/sync.ts — loads the household roster into useHouseholdStore.
import { useEffect } from 'react';
import { useAuthStore } from '@/features/auth/store';
import { getInviteCode, getMembers, type HouseholdMember } from './api';
import { useHouseholdStore } from './store';

export interface HouseholdSyncDeps {
  getMembers: (householdId: string) => Promise<HouseholdMember[]>;
  getInviteCode: (householdId: string) => Promise<string>;
}

const defaultDeps: HouseholdSyncDeps = { getMembers, getInviteCode };

/** True while `householdId` is still the signed-in household (drops stale responses). */
function stillCurrent(householdId: string): boolean {
  return useAuthStore.getState().householdId === householdId;
}

/**
 * (Re)load the member list. Best-effort: on failure the cached list is kept.
 * Call after anything that changes membership rows (rename, join).
 */
export async function refreshMembers(
  householdId: string,
  deps: HouseholdSyncDeps = defaultDeps,
): Promise<void> {
  try {
    const members = await deps.getMembers(householdId);
    if (stillCurrent(householdId)) useHouseholdStore.getState().setMembers(householdId, members);
  } catch (err) {
    if (__DEV__) console.warn('[household] members load failed', err);
  }
}

/**
 * Members always; the invite code only when bootstrap / household creation did not
 * already cache it (the join path, whose RPC returns just the id).
 */
export async function loadHousehold(
  householdId: string,
  deps: HouseholdSyncDeps = defaultDeps,
): Promise<void> {
  const cached = useHouseholdStore.getState();
  const needsCode = cached.householdId !== householdId || !cached.inviteCode;
  await Promise.all([
    refreshMembers(householdId, deps),
    needsCode
      ? deps
          .getInviteCode(householdId)
          .then((code) => {
            if (stillCurrent(householdId)) {
              useHouseholdStore.getState().setInviteCode(householdId, code);
            }
          })
          .catch((err: unknown) => {
            if (__DEV__) console.warn('[household] invite code load failed', err);
          })
      : Promise.resolve(),
  ]);
}

/** Mount once in the (app) layout: loads the roster whenever the household changes. */
export function useHouseholdMembersSync(): void {
  const householdId = useAuthStore((s) => s.householdId);
  useEffect(() => {
    if (householdId) void loadHousehold(householdId);
  }, [householdId]);
}

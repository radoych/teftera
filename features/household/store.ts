// features/household/store.ts — cached household roster + invite code.
// Members change roughly once a year, so they are loaded once per (app) mount by
// useHouseholdMembersSync and refreshed explicitly after a rename or join — never per screen.
import { create } from 'zustand';
import type { HouseholdMember } from './api';

interface HouseholdState {
  /** Household the cached data belongs to; null = nothing cached. */
  householdId: string | null;
  members: HouseholdMember[];
  inviteCode: string;
  setInviteCode: (householdId: string, inviteCode: string) => void;
  setMembers: (householdId: string, members: HouseholdMember[]) => void;
  reset: () => void;
}

const empty = { householdId: null, members: [], inviteCode: '' };

export const useHouseholdStore = create<HouseholdState>((set, get) => ({
  ...empty,
  // Writing for a different household drops the other household's cache first.
  setInviteCode: (householdId, inviteCode) =>
    set(get().householdId === householdId ? { inviteCode } : { ...empty, householdId, inviteCode }),
  setMembers: (householdId, members) =>
    set(get().householdId === householdId ? { members } : { ...empty, householdId, members }),
  reset: () => set(empty),
}));

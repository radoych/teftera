import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { AuthStatus } from './resolveRedirect';

export type { AuthStatus };

interface AuthState {
  status: AuthStatus;
  session: Session | null;
  householdId: string | null;
  displayName: string | null;
  setStatus: (status: AuthStatus) => void;
  setSession: (session: Session | null) => void;
  setHousehold: (householdId: string | null, displayName: string | null) => void;
  enterHousehold: (householdId: string, displayName: string) => void;
  reset: () => void;
}

const cleared = { session: null, householdId: null, displayName: null };

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  ...cleared,
  setStatus: (status) => set({ status }),
  setSession: (session) => set({ session }),
  setHousehold: (householdId, displayName) => set({ householdId, displayName }),
  enterHousehold: (householdId, displayName) =>
    set({ householdId, displayName, status: 'ready' }),
  reset: () => set({ ...cleared, status: 'unauthenticated' }),
}));

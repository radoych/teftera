// features/auth/bootstrap.ts
import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';
import { getMyHousehold } from '@/features/household/api';
import { useHouseholdStore } from '@/features/household/store';
import { resolveRedirect } from './resolveRedirect';
import { shouldSkipAuthEvent } from './sessionEvents';
import { useAuthStore } from './store';

let lastAppliedUserId: string | null = null;

/** Apply a session to the store. A failed household lookup → status 'error' (retry screen). */
async function applySession(session: Session | null): Promise<void> {
  const { setStatus, setSession, setHousehold, reset } = useAuthStore.getState();
  if (!session) {
    lastAppliedUserId = null;
    reset();
    useHouseholdStore.getState().reset();
    return;
  }
  setSession(session);
  try {
    const household = await getMyHousehold(session.user.id);
    lastAppliedUserId = session.user.id;
    if (household) {
      useHouseholdStore.getState().setInviteCode(household.householdId, household.inviteCode);
      setHousehold(household.householdId, household.displayName);
      setStatus('ready');
    } else {
      const metadataName =
        (session.user.user_metadata?.display_name as string | undefined) ?? null;
      setHousehold(null, metadataName);
      setStatus('needs-household');
    }
  } catch (err) {
    if (__DEV__) console.warn('[auth] bootstrap household lookup failed', err);
    setStatus('error');
  }
}

/** (Re)start hydration: also the retry action for the error screen. */
export function retryBootstrap(): void {
  useAuthStore.getState().setStatus('loading');
  supabase.auth
    .getSession()
    .then(({ data }) => applySession(data.session))
    .catch((err) => {
      if (__DEV__) console.warn('[auth] getSession failed', err);
      useAuthStore.getState().setStatus('error');
    });
}

/** Hydrate the auth store from Supabase and keep it live. Call once, in the root layout. */
export function useAuthBootstrap(): void {
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        shouldSkipAuthEvent(event, session?.user.id, lastAppliedUserId, useAuthStore.getState().status)
      ) {
        return;
      }
      void applySession(session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
}

/** Redirect to the correct group based on auth status. Call once, in the root layout. */
export function useProtectedRoute(): void {
  const status = useAuthStore((s) => s.status);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const target = resolveRedirect(status, segments as string[]);
    if (target) router.replace(target as never);
  }, [status, segments, router]);
}

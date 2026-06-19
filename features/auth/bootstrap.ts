// features/auth/bootstrap.ts
import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';
import { getMyHousehold } from '@/features/household/api';
import { resolveRedirect } from './resolveRedirect';
import { useAuthStore } from './store';

/** Hydrate the auth store from Supabase and keep it live. Call once, in the root layout. */
export function useAuthBootstrap(): void {
  const { setStatus, setSession, setHousehold, reset } = useAuthStore.getState();

  useEffect(() => {
    let active = true;

    async function applySession(session: Session | null) {
      if (!active) return;
      if (!session) {
        reset();
        return;
      }
      setSession(session);
      const household = await getMyHousehold();
      if (!active) return;
      if (household) {
        setHousehold(household.householdId, household.displayName);
        setStatus('ready');
      } else {
        setHousehold(null, null);
        setStatus('needs-household');
      }
    }

    supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [reset, setHousehold, setSession, setStatus]);
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

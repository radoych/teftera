// features/preferences/sync.ts — load the user's preferences once on app mount.
import { useEffect } from 'react';
import { useAuthStore } from '@/features/auth/store';
import { getMyPreferences } from './api';
import { resolveDashboardSections } from './layout';
import { usePreferencesStore } from './store';

/** Fetch the signed-in user's preferences into the store. Call once in (app) layout. */
export function usePreferencesSync(): void {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);

  useEffect(() => {
    if (!userId) {
      usePreferencesStore.getState().reset();
      return;
    }
    let active = true;
    (async () => {
      try {
        const stored = await getMyPreferences(userId);
        if (!active) return;
        usePreferencesStore.getState().setPreferences({
          version: 1,
          dashboardSections: resolveDashboardSections(stored?.dashboardSections),
        });
      } catch (err) {
        if (__DEV__) console.warn('[preferences] load failed', err);
        if (active) {
          usePreferencesStore.getState().setPreferences({
            version: 1,
            dashboardSections: resolveDashboardSections(null),
          });
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [userId]);
}

// features/loyalty/useBrightnessBoost.ts — max screen brightness while a card presenter is focused.
import * as Brightness from 'expo-brightness';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { AppState, Platform } from 'react-native';
import { createBrightnessBoost, type BrightnessDeps } from './brightness';

/**
 * Android changes only this app window's brightness (no permission), so
 * "restore" means dropping the window override and following the system again.
 * iOS changes the SYSTEM value, so we must put back exactly what we read.
 */
const nativeDeps: BrightnessDeps = {
  get: () => Brightness.getBrightnessAsync(),
  set: (value) => Brightness.setBrightnessAsync(value),
  restore: (original) =>
    Platform.OS === 'android'
      ? Brightness.restoreSystemBrightnessAsync()
      : Brightness.setBrightnessAsync(original),
};

/**
 * On focus: remember brightness and go to max. Restore on blur / unmount and
 * when the app goes to the background; re-apply when it becomes active again.
 * No-op on web.
 */
export function useBrightnessBoost(): void {
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === 'web') return undefined;
      const boost = createBrightnessBoost(nativeDeps);
      void boost.boost();
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') void boost.boost();
        else if (state === 'background') void boost.release();
      });
      return () => {
        sub.remove();
        void boost.release();
      };
    }, []),
  );
}

import '../global.css';

import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { OfflineBanner } from '@/components/OfflineBanner';
import { AuthErrorScreen } from '@/components/AuthErrorScreen';
import { useAuthStore } from '@/features/auth/store';
import { retryBootstrap, useAuthBootstrap, useProtectedRoute } from '@/features/auth/bootstrap';
import { colors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  const status = useAuthStore((s) => s.status);
  useAuthBootstrap();
  useProtectedRoute();

  useEffect(() => {
    if ((fontsLoaded || fontError) && status !== 'loading') {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, status]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <StatusBar style="light" />
        {status === 'error' ? (
          <AuthErrorScreen onRetry={retryBootstrap} />
        ) : (
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
              animation: 'slide_from_right',
            }}>
            <Stack.Screen name="(app)" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="scanner" options={{ animation: 'fade' }} />
            <Stack.Screen
              name="confirm-receipt"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="manual-entry"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen name="transaction/[id]" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="import-dsk" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="categories" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="vendors" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="vendor/[id]" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="loyalty-cards" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="card/[id]" options={{ presentation: 'modal', animation: 'fade' }} />
            <Stack.Screen name="list/[id]" options={{ animation: 'slide_from_right' }} />
          </Stack>
        )}
        <OfflineBanner />
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

// Route-level crash fallback — keeps the rest of the nav tree alive.
export { ScreenErrorFallback as ErrorBoundary } from '@/components/ScreenErrorFallback';

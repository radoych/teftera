import { Tabs } from 'expo-router';
import { BottomNav } from '@/components/BottomNav';
import { useTransactionsSync } from '@/features/transactions/sync';
import { usePreferencesSync } from '@/features/preferences/sync';

/** Main app tab navigator with the floating frosted pill nav. */
export default function AppTabsLayout() {
  useTransactionsSync();
  usePreferencesSync();

  return (
    <Tabs
      tabBar={(props) => <BottomNav {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: '#121316' } }}>
      <Tabs.Screen name="index" options={{ title: 'Начало' }} />
      <Tabs.Screen name="history" options={{ title: 'История' }} />
      <Tabs.Screen name="insights" options={{ title: 'Анализи' }} />
      <Tabs.Screen name="profile" options={{ title: 'Профил' }} />
    </Tabs>
  );
}

// Route-level crash fallback — keeps the rest of the nav tree alive.
export { ScreenErrorFallback as ErrorBoundary } from '@/components/ScreenErrorFallback';

import { Tabs } from 'expo-router';
import { BottomNav } from '@/components/BottomNav';

/** Main app tab navigator with the floating frosted pill nav. */
export default function AppTabsLayout() {
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

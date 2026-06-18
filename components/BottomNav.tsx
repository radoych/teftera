import { MaterialIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

// Derive the exact tabBar props type expo-router's Tabs provides (it bundles its
// own copy of the bottom-tabs types, which differs nominally from the standalone
// @react-navigation/bottom-tabs package).
type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const TABS: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Начало', icon: 'home' },
  history: { label: 'История', icon: 'history' },
  insights: { label: 'Анализи', icon: 'insert-chart' },
  profile: { label: 'Профил', icon: 'person' },
};

/**
 * Floating frosted pill navigation. Used as the custom tabBar for the (app)
 * group. Active tab shows a filled surface-container-high pill with icon + label;
 * inactive tabs show just the icon. BlurView provides the frosted effect
 * (backdrop-filter does not work on Android RN).
 */
export function BottomNav({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 12 }}
      className="items-center">
      <BlurView
        intensity={40}
        tint="dark"
        className="h-16 flex-row items-center justify-around overflow-hidden rounded-full border border-white/10 bg-surface-container-lowest/80 px-4"
        style={{ width: '90%', maxWidth: 420 }}>
        {state.routes.map((route, index) => {
          const tab = TABS[route.name];
          if (!tab) return null;
          const focused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              onPress={onPress}
              className="items-center justify-center">
              {focused ? (
                <View className="flex-row items-center gap-2 rounded-full bg-surface-container-high px-4 py-2">
                  <MaterialIcons name={tab.icon} size={22} color="#e3e2e6" />
                  <Text className="font-inter-semibold text-label-md text-on-surface">
                    {tab.label}
                  </Text>
                </View>
              ) : (
                <View className="p-3">
                  <MaterialIcons name={tab.icon} size={22} color="#c4c6d0" />
                </View>
              )}
            </Pressable>
          );
        })}
      </BlurView>
    </View>
  );
}

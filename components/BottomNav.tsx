import { MaterialIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ComponentProps } from 'react';
import { colors } from '@/lib/theme';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

// Derive the exact tabBar props type expo-router's Tabs provides (it bundles its
// own copy of the bottom-tabs types, which differs nominally from the standalone
// @react-navigation/bottom-tabs package).
type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const TABS: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Начало', icon: 'home' },
  history: { label: 'История', icon: 'history' },
  lists: { label: 'Списъци', icon: 'checklist' },
  insights: { label: 'Анализи', icon: 'insert-chart' },
  profile: { label: 'Профил', icon: 'person' },
};

// Active cell share. Sized so the widest label ("АНАЛИЗИ") fits its pill, scale
// included, with clear space to the bar's rounded edge on a 360dp phone.
const ACTIVE_GROW = 3;

const styles = StyleSheet.create({
  cell: { flexBasis: 0, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
  // Content-hugging pill, 40dp tall (44 after the 1.1 scale) inside the 68dp bar.
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 12,
    flexShrink: 1,
    minWidth: 0,
    borderRadius: 9999,
  },
  pillActive: { backgroundColor: colors.primaryContainer },
  // Same type as the floating Ръчно / Сканирай pills (label-md, semibold, caps).
  label: {
    flexShrink: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    lineHeight: 14,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.onPrimary,
  },
});

/**
 * Floating frosted pill navigation. Used as the custom tabBar for the (app)
 * group. Active tab shows a filled primary-container pill (icon + label),
 * slightly enlarged, matching the transaction-log mockup; inactive tabs show
 * just the icon. BlurView provides the frosted effect (backdrop-filter does
 * not work on Android RN).
 */
export function BottomNav({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        position: 'absolute',
        left: 8,
        right: 8,
        bottom: insets.bottom + 12,
        pointerEvents: 'box-none',
      }}
      className="items-center">
      <BlurView
        intensity={40}
        tint="dark"
        // NativeWind className is NOT applied to third-party components like
        // BlurView, so the bar's layout + shape must be set via inline style.
        style={{
          alignSelf: 'stretch',
          maxWidth: 460,
          height: 68,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 8,
          borderRadius: 9999,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.1)',
          backgroundColor: 'rgba(30,32,35,0.7)', // surface-container @ 70%
          overflow: 'hidden',
        }}>
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
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: focused }}
              onPress={onPress}
              // Stable proportional layout: the active tab just grows (flexGrow) so
              // its label has room; no natural-width measuring, no conditional style
              // shapes. All styling is inline (no conditional className).
              style={[styles.cell, { flexGrow: focused ? ACTIVE_GROW : 1 }]}>
              <View
                style={[
                  styles.pill,
                  focused && styles.pillActive,
                  { transform: [{ scale: focused ? 1.1 : 1 }] },
                ]}>
                <MaterialIcons
                  name={tab.icon}
                  size={20}
                  color={focused ? colors.onPrimary : colors.onSurfaceVariant}
                />
                {focused ? (
                  <Text numberOfLines={1} style={styles.label}>
                    {tab.label}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </BlurView>
    </View>
  );
}

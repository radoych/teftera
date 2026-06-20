import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

export interface FloatingAction {
  label: string;
  icon: IconName;
  onPress?: () => void;
  /** 'filled' = primary accent pill, 'ghost' = outlined pill (default). */
  variant?: 'filled' | 'ghost';
}

const VARIANTS = {
  filled: { container: 'bg-primary-container', content: '#112f5e' },
  ghost: { container: 'border border-white/10 bg-surface-container-high', content: '#e3e2e6' },
} as const;

/**
 * A row of pill actions pinned just above the floating nav bar. It self-positions
 * (safe-area aware) so it lands in the EXACT same spot on every screen — the one
 * source of truth for where floating actions live.
 *
 * Pass it to `Screen`'s `floatingAboveTabBar` slot, which mounts it outside the
 * ScrollView (so it stays fixed) and reserves bottom padding so content clears it.
 */
export function FloatingActionBar({ actions }: { actions: FloatingAction[] }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      // Sits 12px above the nav pill (nav: bottom insets.bottom+12, height 64).
      style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 88 }}
      className="items-center px-md">
      <View style={{ transform: [{ scale: 1.1 }] }} className="flex-row justify-center gap-md">
        {actions.map((action) => {
          const v = VARIANTS[action.variant ?? 'ghost'];
          return (
            <Pressable
              key={action.label}
              onPress={action.onPress}
              accessibilityRole="button"
              className={`h-10 flex-row items-center gap-2 rounded-full px-6 active:opacity-80 ${v.container}`}>
              <MaterialIcons name={action.icon} size={18} color={v.content} />
              <Text
                style={{ color: v.content }}
                className="font-inter-semibold text-label-md uppercase">
                {action.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

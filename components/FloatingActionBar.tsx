import { MaterialIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardHeight } from '@/lib/useKeyboardHeight';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

export interface FloatingAction {
  label: string;
  icon: IconName;
  onPress?: () => void;
  /** 'filled' = primary accent, 'ghost' = outlined (default), 'destructive' = error. */
  variant?: 'filled' | 'ghost' | 'destructive';
  loading?: boolean;
  disabled?: boolean;
}

const VARIANTS = {
  filled: { container: 'bg-primary-container', content: '#112f5e' },
  ghost: { container: 'border border-white/10 bg-surface-container-high', content: '#e3e2e6' },
  destructive: { container: 'bg-error-container', content: '#ffb4ab' },
} as const;

interface FloatingActionBarProps {
  actions: FloatingAction[];
  /** 'aboveTabBar' floats above the nav pill (default); 'bottom' pins near the safe-area bottom. */
  placement?: 'aboveTabBar' | 'bottom';
  /** When true (use with 'bottom'), the bar rises above the keyboard. */
  liftWithKeyboard?: boolean;
}

/**
 * A row of pill actions. 'aboveTabBar' keeps the centered cluster above the nav
 * pill; 'bottom' lays actions out full-width (space-between) near the bottom of
 * a non-tab screen, optionally lifting above the keyboard.
 */
export function FloatingActionBar({
  actions,
  placement = 'aboveTabBar',
  liftWithKeyboard = false,
}: FloatingActionBarProps) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();

  const bottom =
    placement === 'aboveTabBar'
      ? insets.bottom + 88
      : (liftWithKeyboard && keyboard > 0 ? keyboard : insets.bottom) + 16;

  const single = actions.length === 1;

  const buttons = actions.map((action) => {
    const v = VARIANTS[action.variant ?? 'ghost'];
    const inactive = action.disabled || action.loading;
    return (
      <Pressable
        key={action.label}
        onPress={inactive ? undefined : action.onPress}
        disabled={inactive}
        accessibilityRole="button"
        className={`h-12 flex-row items-center justify-center gap-2 rounded-full px-6 active:opacity-80 ${
          v.container
        } ${placement === 'bottom' && !single ? 'flex-1' : ''} ${inactive ? 'opacity-60' : ''}`}>
        {action.loading ? (
          <ActivityIndicator color={v.content} />
        ) : (
          <>
            <MaterialIcons name={action.icon} size={18} color={v.content} />
            <Text
              style={{ color: v.content }}
              className="font-inter-semibold text-label-md uppercase">
              {action.label}
            </Text>
          </>
        )}
      </Pressable>
    );
  });

  if (placement === 'bottom') {
    return (
      <View
        style={{ position: 'absolute', left: 0, right: 0, bottom, pointerEvents: 'box-none' }}
        className="px-md">
        <View className={`flex-row gap-md ${single ? 'justify-center' : 'justify-between'}`}>
          {buttons}
        </View>
      </View>
    );
  }

  return (
    <View
      style={{ position: 'absolute', left: 0, right: 0, bottom, pointerEvents: 'box-none' }}
      className="items-center px-md">
      <View style={{ transform: [{ scale: 1.1 }] }} className="flex-row justify-center gap-md">
        {buttons}
      </View>
    </View>
  );
}

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
  /** When true, the bar rises above the keyboard while one is open (e.g. forms). */
  liftWithKeyboard?: boolean;
}

/**
 * A centered cluster of content-hugging pill actions (single → centered, two+ →
 * side by side, equal hug). The single source of truth for the app's floating
 * pill look. It rests at one height (insets.bottom + 88) on every screen so the
 * actions line up; with `liftWithKeyboard` it rises above an open keyboard.
 */
export function FloatingActionBar({
  actions,
  liftWithKeyboard = false,
}: FloatingActionBarProps) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();

  const bottom =
    liftWithKeyboard && keyboard > 0 ? keyboard + 24 : insets.bottom + 88;

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
        } ${inactive ? 'opacity-60' : ''}`}>
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

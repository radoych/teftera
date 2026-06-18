import { MaterialIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

export type PillVariant = 'filled' | 'ghost' | 'tonal';

interface PillButtonProps {
  label: string;
  onPress?: () => void;
  icon?: IconName;
  variant?: PillVariant;
  disabled?: boolean;
  loading?: boolean;
  /** Stretch to fill the parent width. */
  block?: boolean;
  uppercase?: boolean;
}

const VARIANTS: Record<PillVariant, { container: string; content: string }> = {
  // Primary CTA — light blue fill, dark ink.
  filled: { container: 'bg-primary-container', content: '#112f5e' },
  // Outlined ghost pill over the dark surface.
  ghost: {
    container: 'bg-transparent border border-white/10',
    content: '#e3e2e6',
  },
  // Subtle filled surface.
  tonal: { container: 'bg-surface-container-high', content: '#e3e2e6' },
};

/**
 * Pill-shaped button. Uses borderRadius 9999 (the `rounded-full` token is
 * overridden to a true pill in tailwind.config.js).
 */
export function PillButton({
  label,
  onPress,
  icon,
  variant = 'filled',
  disabled = false,
  loading = false,
  block = false,
  uppercase = false,
}: PillButtonProps) {
  const v = VARIANTS[variant];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      className={`h-12 flex-row items-center justify-center gap-2 rounded-full px-6 active:opacity-80 ${v.container} ${block ? 'w-full' : ''} ${isDisabled ? 'opacity-40' : ''}`}>
      {loading ? (
        <ActivityIndicator color={v.content} />
      ) : (
        <View className="flex-row items-center gap-2">
          {icon ? <MaterialIcons name={icon} size={20} color={v.content} /> : null}
          <Text
            style={{ color: v.content }}
            className={`font-jakarta-semibold text-headline-md ${uppercase ? 'uppercase' : ''}`}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors } from '@/lib/theme';

interface ScreenHeaderProps {
  title: string;
  /** Back-arrow handler. Defaults to `router.back()`. */
  onBack?: () => void;
  /**
   * Centred title between the back arrow and the `right` slot (stack forms and
   * detail screens). Default: title left-aligned next to the back arrow.
   */
  centered?: boolean;
  /** Optional trailing action (icon button, …). */
  right?: ReactNode;
  /** Extra classes on the row — e.g. horizontal padding outside `Screen`. */
  className?: string;
}

/** Top app bar for stack screens: back arrow + title, optional trailing action. */
export function ScreenHeader({
  title,
  onBack,
  centered = false,
  right,
  className = '',
}: ScreenHeaderProps) {
  const back = (
    <Pressable
      onPress={onBack ?? (() => router.back())}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Назад"
      className="-ml-2 p-2"
    >
      <MaterialIcons name="arrow-back" size={24} color={colors.onSurface} />
    </Pressable>
  );
  const titleText = (
    <Text
      className="font-jakarta-semibold text-headline-lg-mobile text-on-surface"
      numberOfLines={1}
    >
      {title}
    </Text>
  );

  if (centered) {
    return (
      <View className={`flex-row items-center justify-between py-4 ${className}`}>
        {back}
        {titleText}
        {/* Spacer keeps the title optically centred when there is no action. */}
        {right ?? <View className="w-8" />}
      </View>
    );
  }

  return (
    <View className={`mb-md flex-row items-center gap-3 py-2 ${className}`}>
      {back}
      <View className="flex-1">{titleText}</View>
      {right}
    </View>
  );
}

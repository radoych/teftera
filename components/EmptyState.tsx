import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import type { MaterialIconName } from '@/lib/categories';

interface EmptyStateProps {
  icon: MaterialIconName;
  title: string;
  message?: string;
  cta?: { label: string; onPress: () => void };
}

/** Centered empty-state block: icon + title + optional message + optional pill CTA. */
export function EmptyState({ icon, title, message, cta }: EmptyStateProps) {
  return (
    <View className="items-center px-8 py-xxl">
      <View className="mb-md h-28 w-28 items-center justify-center rounded-full bg-primary-container/5">
        <View className="h-20 w-20 items-center justify-center rounded-full bg-surface-container">
          <MaterialIcons name={icon} size={32} color="#8e909a" />
        </View>
      </View>
      <Text className="text-center font-jakarta-semibold text-headline-md text-on-surface">
        {title}
      </Text>
      {message ? (
        <Text className="mt-2 text-center font-inter text-body-md text-on-surface-variant opacity-70">
          {message}
        </Text>
      ) : null}
      {cta ? (
        <Pressable
          onPress={cta.onPress}
          className="mt-lg rounded-full border border-primary-container px-6 py-2 active:bg-primary-container/10">
          <Text className="font-inter text-label-md text-primary-container">{cta.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

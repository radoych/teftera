import { MaterialIcons } from '@expo/vector-icons';
import type { ErrorBoundaryProps } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackgroundGlow } from '@/components/BackgroundGlow';
import { colors } from '@/lib/theme';

/**
 * Route-level error fallback (expo-router ErrorBoundary contract). Exported as
 * `ErrorBoundary` from layouts and standalone screens so a render crash keeps
 * the rest of the navigation tree alive.
 */
export function ScreenErrorFallback({ error, retry }: ErrorBoundaryProps) {
  return (
    <View className="flex-1 bg-background">
      <BackgroundGlow />
      <SafeAreaView className="flex-1 items-center justify-center px-8" edges={['top', 'bottom']}>
        <View className="mb-md h-16 w-16 items-center justify-center rounded-full bg-surface-container">
          <MaterialIcons name="error-outline" size={28} color={colors.error} />
        </View>
        <Text className="text-center font-jakarta-semibold text-headline-md text-on-surface">
          Нещо се обърка
        </Text>
        {__DEV__ ? (
          <Text className="mt-2 text-center font-inter text-body-md text-error">
            {error.message}
          </Text>
        ) : null}
        <Pressable
          onPress={() => retry()}
          className="mt-lg rounded-full bg-primary-container px-6 py-3 active:opacity-90">
          <Text className="font-inter-semibold text-label-md uppercase text-on-primary">
            Опитай отново
          </Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

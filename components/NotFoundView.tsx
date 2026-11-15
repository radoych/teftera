import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackgroundGlow } from '@/components/BackgroundGlow';

interface NotFoundViewProps {
  /** Centred explanation, e.g. "Транзакцията не е намерена." */
  message: string;
  /** Back-pill handler. Defaults to `router.back()`. */
  onBack?: () => void;
  /** Back-pill label. Defaults to "Назад". */
  backLabel?: string;
}

/** Full-screen fallback for a stack screen whose record no longer exists. */
export function NotFoundView({
  message,
  onBack,
  backLabel = 'Назад',
}: NotFoundViewProps) {
  return (
    <View className="flex-1 bg-background">
      <BackgroundGlow />
      <SafeAreaView className="flex-1 items-center justify-center px-8" edges={['top']}>
        <Text className="text-center font-inter text-body-lg text-on-surface-variant">
          {message}
        </Text>
        <Pressable
          onPress={onBack ?? (() => router.back())}
          className="mt-lg rounded-full border border-primary-container px-6 py-2"
        >
          <Text className="font-inter text-label-md text-primary-container">
            {backLabel}
          </Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

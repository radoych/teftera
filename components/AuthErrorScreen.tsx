import { Pressable, Text, View } from 'react-native';
import { BackgroundGlow } from './BackgroundGlow';

/** Full-screen fallback when auth bootstrap fails (e.g. offline cold start). */
export function AuthErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <View className="flex-1 items-center justify-center bg-background px-8">
      <BackgroundGlow />
      <Text className="text-center font-jakarta-semibold text-headline-md text-on-surface">
        Нещо се обърка
      </Text>
      <Text className="mt-sm text-center font-inter text-body-md text-on-surface-variant opacity-70">
        Няма връзка със сървъра. Провери интернета и опитай отново.
      </Text>
      <Pressable
        onPress={onRetry}
        className="mt-lg rounded-full bg-primary-container px-8 py-3 active:opacity-80">
        <Text className="font-inter-semibold text-label-md uppercase text-on-primary">
          Опитай отново
        </Text>
      </Pressable>
    </View>
  );
}

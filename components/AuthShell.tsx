import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackgroundGlow } from './BackgroundGlow';

/** Shell for auth / onboarding screens: glow background, safe-area, padding. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <View className="flex-1 bg-background">
      <BackgroundGlow />
      <SafeAreaView className="flex-1">
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View className="flex-1 px-xl">{children}</View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

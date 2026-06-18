import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackgroundGlow } from './BackgroundGlow';

interface ScreenProps {
  children: ReactNode;
  /** Use a ScrollView body (default true). */
  scroll?: boolean;
  /** Add bottom padding so content clears the floating tab pill. */
  withTabBar?: boolean;
  contentClassName?: string;
}

/**
 * Standard screen shell: dark background + ambient glow + safe-area.
 * Flat layout, no cards — sections use HairlineDivider.
 */
export function Screen({
  children,
  scroll = true,
  withTabBar = false,
  contentClassName = '',
}: ScreenProps) {
  const padBottom = withTabBar ? 'pb-32' : 'pb-8';

  return (
    <View className="flex-1 bg-background">
      <BackgroundGlow />
      <SafeAreaView className="flex-1" edges={['top']}>
        {scroll ? (
          <ScrollView
            className="flex-1"
            contentContainerClassName={`px-md ${padBottom} ${contentClassName}`}
            showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        ) : (
          <View className={`flex-1 px-md ${padBottom} ${contentClassName}`}>{children}</View>
        )}
      </SafeAreaView>
    </View>
  );
}

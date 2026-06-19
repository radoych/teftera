import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackgroundGlow } from './BackgroundGlow';

interface ScreenProps {
  children: ReactNode;
  /** Use a ScrollView body (default true). */
  scroll?: boolean;
  /** Add bottom padding so content clears the floating tab pill. */
  withTabBar?: boolean;
  contentClassName?: string;
  /**
   * Content pinned just above the floating tab bar — rendered OUTSIDE the
   * ScrollView so it stays fixed while the body scrolls (e.g. Filters/Search
   * or Scan/Manual action pills). Implies a tab bar is present.
   */
  floatingAboveTabBar?: ReactNode;
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
  floatingAboveTabBar,
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  // Clear the floating nav pill (bottom insets.bottom+12, height 64) plus the
  // floating action pills above it when present.
  const bottomPad = floatingAboveTabBar
    ? insets.bottom + 140
    : withTabBar
      ? insets.bottom + 96
      : 24;

  return (
    <View className="flex-1 bg-background">
      <BackgroundGlow />
      <SafeAreaView className="flex-1" edges={['top']}>
        {scroll ? (
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomPad }}
            contentContainerClassName={contentClassName}
            showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        ) : (
          <View
            style={{ paddingHorizontal: 16, paddingBottom: bottomPad }}
            className={`flex-1 ${contentClassName}`}>
            {children}
          </View>
        )}
      </SafeAreaView>

      {floatingAboveTabBar ? (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 88 }}
          className="items-center px-md">
          {floatingAboveTabBar}
        </View>
      ) : null}
    </View>
  );
}

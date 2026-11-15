import type { ReactNode } from 'react';
import { RefreshControl, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackgroundGlow } from './BackgroundGlow';
import { colors } from '@/lib/theme';

interface ScreenProps {
  children: ReactNode;
  /** Use a ScrollView body (default true). */
  scroll?: boolean;
  /** Add bottom padding so content clears the floating tab pill. */
  withTabBar?: boolean;
  contentClassName?: string;
  /**
   * Content pinned above the floating tab bar — rendered OUTSIDE the ScrollView
   * so it stays fixed while the body scrolls. Intended for `<FloatingActionBar>`,
   * which self-positions; Screen just provides the mount point + clearance.
   */
  floatingAboveTabBar?: ReactNode;
  /** Enables pull-to-refresh on the scrolling body. Ignored when `scroll` is false. */
  onRefresh?: () => void;
  /** Whether the pull-to-refresh spinner is showing. */
  refreshing?: boolean;
  /**
   * Non-scroll body only: apply the bottom clearance as body padding (default
   * true). Pass false when the child is itself a list that should scroll under
   * the floating pills — give it `useScreenBottomPad` as content padding instead.
   */
  padBottom?: boolean;
}

/**
 * Bottom clearance for the floating nav pill (bottom insets.bottom+12, height 64)
 * plus the floating action pills above it when present.
 */
export function useScreenBottomPad({
  floating,
  withTabBar,
}: {
  floating: boolean;
  withTabBar: boolean;
}): number {
  const insets = useSafeAreaInsets();
  return floating ? insets.bottom + 140 : withTabBar ? insets.bottom + 96 : 24;
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
  onRefresh,
  refreshing = false,
  padBottom = true,
}: ScreenProps) {
  const bottomPad = useScreenBottomPad({ floating: !!floatingAboveTabBar, withTabBar });

  return (
    <View className="flex-1 bg-background">
      <BackgroundGlow />
      <SafeAreaView className="flex-1" edges={['top']}>
        {scroll ? (
          <KeyboardAwareScrollView
            style={{ flex: 1 }}
            bottomOffset={bottomPad}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomPad }}
            contentContainerClassName={contentClassName}
            showsVerticalScrollIndicator={false}
            refreshControl={
              onRefresh ? (
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={colors.primaryContainer}
                  colors={[colors.primaryContainer]}
                  progressBackgroundColor={colors.surfaceContainer}
                />
              ) : undefined
            }>
            {children}
          </KeyboardAwareScrollView>
        ) : (
          <View
            style={{ paddingHorizontal: 16, paddingBottom: padBottom ? bottomPad : 0 }}
            className={`flex-1 ${contentClassName}`}>
            {children}
          </View>
        )}
      </SafeAreaView>

      {floatingAboveTabBar}
    </View>
  );
}

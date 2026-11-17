// features/shopping/components/ListProgress.tsx — "3 / 8" + an animated progress bar (spec §8.7).
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { progressWidthPct } from '@/components/ProgressBar';
import { colors } from '@/lib/theme';
import { progressLabel } from '../copy';
import type { ListCounts } from '../types';

/**
 * 2 px track (`outline-variant`) whose `primary-container` fill animates to the
 * new width. Same clamping as the static `ProgressBar` (`progressWidthPct`);
 * kept separate so ProgressBar — and its tests — stay free of Reanimated.
 */
function ProgressFill({ fraction }: { fraction: number }) {
  const pct = progressWidthPct(fraction);
  const width = useSharedValue(pct);
  useEffect(() => {
    width.value = withTiming(pct, { duration: 200 });
  }, [pct, width]);
  const fill = useAnimatedStyle(() => ({ width: `${Math.min(Math.max(width.value, 0), 100)}%` }));

  return (
    <View
      className="w-full overflow-hidden"
      style={{ height: 2, borderRadius: 9999, backgroundColor: colors.outlineVariant }}>
      <Animated.View
        style={[
          { height: '100%', borderRadius: 9999, backgroundColor: colors.primaryContainer },
          fill,
        ]}
      />
    </View>
  );
}

/** Counter on the left, the animated bar, and "Всичко е взето" once nothing is left. */
export function ListProgress({ counts }: { counts: ListCounts }) {
  const allDone = counts.total > 0 && counts.open === 0;
  const fraction = counts.total > 0 ? counts.done / counts.total : 0;

  return (
    <View className="gap-sm">
      <View className="flex-row items-center gap-md">
        <Text className="font-inter-semibold text-data-mono text-on-surface">
          {progressLabel(counts)}
        </Text>
        <View className="flex-1">
          <ProgressFill fraction={fraction} />
        </View>
      </View>
      {allDone ? (
        <Animated.Text
          entering={FadeIn.duration(200)}
          className="font-inter-medium text-body-md text-primary-container">
          Всичко е взето
        </Animated.Text>
      ) : null}
    </View>
  );
}

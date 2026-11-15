import { View } from 'react-native';
import { colors } from '@/lib/theme';

interface ProgressBarProps {
  /** Filled share of the track, 0..1. Values outside the range are clamped. */
  fraction: number;
  /** Fill colour (any CSS colour — a `colors.*` token or a category colour). */
  color: string;
  /** Bar height in px. */
  height?: number;
  /**
   * Smallest visible fill, 0..1 — e.g. `0.02` keeps a tiny category share
   * visible as a sliver instead of an empty track. Default 0 (empty is empty).
   */
  minFraction?: number;
}

/** Fill width as a percentage (0..100) after clamping `fraction` to [minFraction, 1]. */
export function progressWidthPct(fraction: number, minFraction = 0): number {
  const f = Number.isFinite(fraction) ? fraction : 0;
  const min = Math.min(Math.max(minFraction, 0), 1);
  return Math.min(Math.max(f, min), 1) * 100;
}

/**
 * Horizontal pill progress bar — the one track colour (`surface-container`)
 * and default height used everywhere a share or budget is shown.
 */
export function ProgressBar({
  fraction,
  color,
  height = 6,
  minFraction = 0,
}: ProgressBarProps) {
  return (
    <View
      className="w-full overflow-hidden"
      style={{ height, borderRadius: 9999, backgroundColor: colors.surfaceContainer }}
    >
      <View
        style={{
          height: '100%',
          width: `${progressWidthPct(fraction, minFraction)}%`,
          backgroundColor: color,
          borderRadius: 9999,
        }}
      />
    </View>
  );
}

// UI-thread scroll gesture shared by the collapsing large title and the list
// card reveal. Offset model: y = 0 is EXPANDED, y = `distance` is COLLAPSED;
// the decisions are the pure functions in ./collapse.
import {
  scrollTo,
  useAnimatedScrollHandler,
  useSharedValue,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import type Animated from 'react-native-reanimated';
import {
  canExpandFromDragStart,
  clampOffset,
  releaseVelocity,
  sampleVelocity,
  snapTarget,
} from './collapse';

/** Wall clock for velocity sampling — only ever called from scroll events. */
function nowMs(): number {
  'worklet';
  return Date.now();
}

export interface CollapseScroll {
  /** Current content offset (drives the animated styles). */
  scrollY: SharedValue<number>;
  /** Pass as the scrollable's `onScroll` (cast as needed). */
  onScroll: ReturnType<typeof useAnimatedScrollHandler>;
}

/**
 * Scroll handler implementing the One UI rule: a drag that starts deeper than
 * the collapsed position (and its momentum) stops at COLLAPSED; only a new drag
 * from the collapsed top may expand. Releases inside the zone snap (instant
 * under reduced motion). `initialY` seeds `scrollY` for screens that open
 * collapsed.
 */
export function useCollapseScroll(
  listRef: AnimatedRef<Animated.ScrollView>,
  distance: number,
  reduceMotion: boolean,
  initialY = 0,
): CollapseScroll {
  const scrollY = useSharedValue(initialY);
  const expandAllowed = useSharedValue(true);
  const lastY = useSharedValue(initialY);
  const lastT = useSharedValue(0);
  const velocity = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler(
    {
      onBeginDrag: (e) => {
        expandAllowed.value = canExpandFromDragStart(e.contentOffset.y, distance);
      },
      onScroll: (e) => {
        const y = e.contentOffset.y;
        const now = nowMs();
        velocity.value = sampleVelocity(lastY.value, lastT.value, y, now);
        lastY.value = y;
        lastT.value = now;
        scrollY.value = y;
        const pinned = clampOffset(y, distance, expandAllowed.value);
        if (pinned !== null) scrollTo(listRef, 0, pinned, false);
      },
      onEndDrag: (e) => {
        const v = releaseVelocity(velocity.value, lastT.value, nowMs());
        const target = snapTarget(e.contentOffset.y, v, distance, expandAllowed.value);
        if (target !== null) scrollTo(listRef, 0, target, !reduceMotion);
      },
      onMomentumEnd: (e) => {
        const target = snapTarget(e.contentOffset.y, 0, distance, expandAllowed.value);
        if (target !== null) scrollTo(listRef, 0, target, !reduceMotion);
      },
    },
    [distance, reduceMotion],
  );

  return { scrollY, onScroll };
}

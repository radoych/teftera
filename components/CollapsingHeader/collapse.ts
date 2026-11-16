// Pure decision math for the One UI-style collapsing large title.
//
// Coordinate system: `y` is the list's vertical content offset. The large title
// is the first thing in the scroll content, so
//   y = 0          → EXPANDED  (large title fully visible, list starts mid-screen)
//   y = distance   → COLLAPSED (large title scrolled away, first row right under
//                               the compact bar)
//   0 < y < distance → partially expanded ("the zone")
// Velocities are px/ms, positive = offset increasing (= collapsing direction).
//
// Every function is a worklet so the scroll handler can run it on the UI
// thread; they are plain functions under jest.

/** Height of the compact top bar (back arrow + small title + actions). */
export const BAR_HEIGHT = 56;
/** Share of the window height the expanded title area takes (One UI ≈ 40–45%). */
export const EXPANDED_RATIO = 0.42;
/** The expanded area never shrinks below this (tiny windows / landscape). */
export const MIN_EXPANDED_HEIGHT = BAR_HEIGHT + 120;
/** Offsets this close to a resting state count as being at it. */
export const SNAP_EPSILON = 2;
/** Release faster than this (px/ms) picks the state in the swipe direction. */
export const FLING_VELOCITY = 0.5;
/** How far ahead a slow release is projected before picking the nearer state. */
export const PROJECTION_MS = 100;
/** A scroll sample older than this at release means the finger had stopped. */
export const STALE_VELOCITY_MS = 80;
/** Pixels past `distance` over which the bar's hairline fades in. */
export const BORDER_FADE_PX = 8;

/** Progress windows (0 = expanded, 1 = collapsed) for the header animations. */
export const RANGES = {
  /** Large title + subtitle fade out (and shrink slightly) over this window. */
  largeTitle: [0, 0.6],
  /** Small title in the compact bar fades in over this window. */
  barTitle: [0.7, 1],
  /** Compact bar background becomes opaque over this window. */
  barBackground: [0.85, 1],
} as const satisfies Record<string, readonly [number, number]>;

/** Large title scale at full collapse (it shrinks from 1 towards this). */
export const LARGE_TITLE_MIN_SCALE = 0.92;

/** Height of the expanded large-title area inside the top safe area. */
export function expandedHeight(windowHeight: number, topInset: number): number {
  'worklet';
  return Math.max(
    MIN_EXPANDED_HEIGHT,
    Math.round(windowHeight * EXPANDED_RATIO) - topInset,
  );
}

/** Scroll distance between EXPANDED (0) and COLLAPSED. */
export function collapseDistance(expanded: number, bar: number = BAR_HEIGHT): number {
  'worklet';
  return Math.max(0, expanded - bar);
}

/**
 * Minimum content height so a short list can still reach the collapsed
 * position (otherwise its max offset is below `distance` and it could never
 * collapse). 0 until the viewport has been measured.
 */
export function contentMinHeight(viewportHeight: number, distance: number): number {
  'worklet';
  return viewportHeight > 0 ? viewportHeight + distance : 0;
}

/**
 * May this drag expand the large title? Only when it starts at (or above) the
 * collapsed-top position. A drag that starts deeper in the list — and the
 * momentum it produces — stops at COLLAPSED.
 */
export function canExpandFromDragStart(dragStartY: number, distance: number): boolean {
  'worklet';
  return dragStartY <= distance + SNAP_EPSILON;
}

/**
 * Offset to force while scrolling, or null to leave the scroll alone. A gesture
 * that may not expand is pinned at COLLAPSED instead of flying open.
 */
export function clampOffset(
  y: number,
  distance: number,
  expandAllowed: boolean,
): number | null {
  'worklet';
  if (expandAllowed || distance <= 0) return null;
  return y < distance - SNAP_EPSILON ? distance : null;
}

/** Velocity in px/ms between two scroll samples (0 for a non-positive dt). */
export function sampleVelocity(
  prevY: number,
  prevT: number,
  y: number,
  t: number,
): number {
  'worklet';
  const dt = t - prevT;
  return dt > 0 ? (y - prevY) / dt : 0;
}

/** Velocity to use at release: a stale last sample means the finger had stopped. */
export function releaseVelocity(
  lastVelocity: number,
  lastSampleT: number,
  now: number,
): number {
  'worklet';
  return now - lastSampleT > STALE_VELOCITY_MS ? 0 : lastVelocity;
}

/**
 * Where to settle after a release (end of drag or end of momentum), or null
 * when the list is already at rest outside the zone. In the zone a fast swipe
 * goes the way it was heading; a slow one snaps to the nearer state after a
 * short projection.
 */
export function snapTarget(
  y: number,
  velocity: number,
  distance: number,
  expandAllowed = true,
): number | null {
  'worklet';
  if (distance <= 0) return null;
  if (y <= SNAP_EPSILON || y >= distance - SNAP_EPSILON) return null;
  if (!expandAllowed) return distance;
  if (velocity <= -FLING_VELOCITY) return 0;
  if (velocity >= FLING_VELOCITY) return distance;
  const projected = y + velocity * PROJECTION_MS;
  return projected < distance / 2 ? 0 : distance;
}

/** 0 = expanded … 1 = collapsed. Overscroll (y < 0) reads as 0. */
export function collapseProgress(y: number, distance: number): number {
  'worklet';
  if (distance <= 0) return 1;
  return Math.min(1, Math.max(0, y / distance));
}

/** Linear 0→1 ramp of `p` across `[start, end]`, clamped. */
export function ramp(p: number, range: readonly [number, number]): number {
  'worklet';
  const [start, end] = range;
  if (end <= start) return p >= end ? 1 : 0;
  return Math.min(1, Math.max(0, (p - start) / (end - start)));
}

/** Visual state of the header for a given offset — fed to useAnimatedStyle. */
export interface HeaderVisuals {
  largeTitleOpacity: number;
  largeTitleScale: number;
  barTitleOpacity: number;
  barBackgroundOpacity: number;
  borderOpacity: number;
}

export function headerVisuals(
  y: number,
  distance: number,
  reduceMotion = false,
): HeaderVisuals {
  'worklet';
  const p = collapseProgress(y, distance);
  const titleOut = ramp(p, RANGES.largeTitle);
  return {
    largeTitleOpacity: 1 - titleOut,
    largeTitleScale: reduceMotion ? 1 : 1 - (1 - LARGE_TITLE_MIN_SCALE) * titleOut,
    barTitleOpacity: ramp(p, RANGES.barTitle),
    barBackgroundOpacity: ramp(p, RANGES.barBackground),
    // The hairline only appears once content is actually under the bar.
    borderOpacity: Math.min(1, Math.max(0, (y - Math.max(0, distance)) / BORDER_FADE_PX)),
  };
}

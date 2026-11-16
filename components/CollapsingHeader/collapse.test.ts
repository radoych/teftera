import {
  BAR_HEIGHT,
  BORDER_FADE_PX,
  FLING_VELOCITY,
  LARGE_TITLE_MIN_SCALE,
  MIN_EXPANDED_HEIGHT,
  STALE_VELOCITY_MS,
  canExpandFromDragStart,
  clampOffset,
  collapseDistance,
  collapseProgress,
  contentMinHeight,
  expandedHeight,
  headerVisuals,
  ramp,
  releaseVelocity,
  revealVisuals,
  TILE_MIN_SCALE,
  sampleVelocity,
  snapTarget,
} from './collapse';

const D = 300; // collapse distance used throughout

describe('expandedHeight', () => {
  it('takes ~42% of the window, minus the top inset already outside the area', () => {
    expect(expandedHeight(800, 0)).toBe(336);
    expect(expandedHeight(800, 40)).toBe(296);
  });

  it('never drops below the minimum', () => {
    expect(expandedHeight(300, 50)).toBe(MIN_EXPANDED_HEIGHT);
  });
});

describe('collapseDistance', () => {
  it('is the expanded height minus the compact bar', () => {
    expect(collapseDistance(356)).toBe(356 - BAR_HEIGHT);
    expect(collapseDistance(200, 50)).toBe(150);
  });

  it('is never negative', () => {
    expect(collapseDistance(10, 56)).toBe(0);
  });
});

describe('contentMinHeight', () => {
  it('lets short content still scroll to the collapsed position', () => {
    expect(contentMinHeight(600, D)).toBe(900);
  });

  it('is 0 before the viewport is measured', () => {
    expect(contentMinHeight(0, D)).toBe(0);
  });
});

describe('canExpandFromDragStart', () => {
  it('allows expanding from the expanded or collapsed-top position', () => {
    expect(canExpandFromDragStart(0, D)).toBe(true);
    expect(canExpandFromDragStart(150, D)).toBe(true);
    expect(canExpandFromDragStart(D, D)).toBe(true);
    expect(canExpandFromDragStart(D + 1.5, D)).toBe(true); // within epsilon
    expect(canExpandFromDragStart(-20, D)).toBe(true); // iOS overscroll
  });

  it('refuses when the drag starts inside the list', () => {
    expect(canExpandFromDragStart(D + 3, D)).toBe(false);
    expect(canExpandFromDragStart(2000, D)).toBe(false);
  });
});

describe('clampOffset', () => {
  it('pins a non-expanding gesture at the collapsed position', () => {
    expect(clampOffset(250, D, false)).toBe(D);
    expect(clampOffset(0, D, false)).toBe(D);
    expect(clampOffset(-40, D, false)).toBe(D);
  });

  it('leaves offsets at or below the list top alone', () => {
    expect(clampOffset(D, D, false)).toBeNull();
    expect(clampOffset(D - 1, D, false)).toBeNull(); // within epsilon
    expect(clampOffset(900, D, false)).toBeNull();
  });

  it('never clamps an expanding gesture', () => {
    expect(clampOffset(0, D, true)).toBeNull();
    expect(clampOffset(150, D, true)).toBeNull();
  });

  it('does nothing without a collapse distance', () => {
    expect(clampOffset(0, 0, false)).toBeNull();
  });
});

describe('sampleVelocity / releaseVelocity', () => {
  it('measures px/ms between samples', () => {
    expect(sampleVelocity(100, 1000, 120, 1010)).toBe(2);
    expect(sampleVelocity(100, 1000, 80, 1010)).toBe(-2);
  });

  it('is 0 for a non-positive dt', () => {
    expect(sampleVelocity(0, 1000, 50, 1000)).toBe(0);
    expect(sampleVelocity(0, 1000, 50, 990)).toBe(0);
  });

  it('drops a stale sample (finger stopped before release)', () => {
    expect(releaseVelocity(-3, 1000, 1000 + STALE_VELOCITY_MS + 1)).toBe(0);
    expect(releaseVelocity(-3, 1000, 1000 + STALE_VELOCITY_MS)).toBe(-3);
  });
});

describe('snapTarget', () => {
  it('returns null when already resting in a state or inside the list', () => {
    expect(snapTarget(0, 0, D)).toBeNull();
    expect(snapTarget(1, -5, D)).toBeNull();
    expect(snapTarget(D, 0, D)).toBeNull();
    expect(snapTarget(D - 1, 5, D)).toBeNull();
    expect(snapTarget(1200, -5, D)).toBeNull();
    expect(snapTarget(-30, 0, D)).toBeNull(); // overscroll bounces back by itself
  });

  it('snaps a slow release to the nearer state', () => {
    expect(snapTarget(100, 0, D)).toBe(0);
    expect(snapTarget(149, 0, D)).toBe(0);
    expect(snapTarget(150, 0, D)).toBe(D);
    expect(snapTarget(250, 0, D)).toBe(D);
  });

  it('projects a slow release a little forward', () => {
    // 160 alone is past half, but heading open at 0.3 px/ms → 130 → expanded
    expect(snapTarget(160, -0.3, D)).toBe(0);
    // 140 alone is under half, but heading closed → 170 → collapsed
    expect(snapTarget(140, 0.3, D)).toBe(D);
  });

  it('follows the direction of a fling regardless of position', () => {
    expect(snapTarget(280, -FLING_VELOCITY, D)).toBe(0);
    expect(snapTarget(20, FLING_VELOCITY, D)).toBe(D);
  });

  it('always collapses when the gesture may not expand', () => {
    expect(snapTarget(20, -5, D, false)).toBe(D);
  });

  it('does nothing without a collapse distance', () => {
    expect(snapTarget(10, 0, 0)).toBeNull();
  });
});

describe('collapseProgress / ramp', () => {
  it('maps the offset to 0..1', () => {
    expect(collapseProgress(0, D)).toBe(0);
    expect(collapseProgress(150, D)).toBe(0.5);
    expect(collapseProgress(D, D)).toBe(1);
    expect(collapseProgress(-50, D)).toBe(0);
    expect(collapseProgress(5000, D)).toBe(1);
    expect(collapseProgress(10, 0)).toBe(1);
  });

  it('ramps linearly inside its window and clamps outside', () => {
    expect(ramp(0.7, [0.7, 1])).toBe(0);
    expect(ramp(0.85, [0.7, 1])).toBeCloseTo(0.5);
    expect(ramp(1, [0.7, 1])).toBe(1);
    expect(ramp(0.2, [0.7, 1])).toBe(0);
  });

  it('treats an empty window as a step', () => {
    expect(ramp(0.4, [0.5, 0.5])).toBe(0);
    expect(ramp(0.5, [0.5, 0.5])).toBe(1);
  });
});

describe('headerVisuals', () => {
  it('shows only the large title when expanded', () => {
    expect(headerVisuals(0, D)).toEqual({
      largeTitleOpacity: 1,
      largeTitleScale: 1,
      barTitleOpacity: 0,
      barBackgroundOpacity: 0,
      borderOpacity: 0,
    });
  });

  it('shows the compact bar when collapsed, hairline only once content is under it', () => {
    const v = headerVisuals(D, D);
    expect(v.largeTitleOpacity).toBe(0);
    expect(v.largeTitleScale).toBeCloseTo(LARGE_TITLE_MIN_SCALE);
    expect(v.barTitleOpacity).toBe(1);
    expect(v.barBackgroundOpacity).toBe(1);
    expect(v.borderOpacity).toBe(0);
    expect(headerVisuals(D + BORDER_FADE_PX / 2, D).borderOpacity).toBeCloseTo(0.5);
    expect(headerVisuals(D + 100, D).borderOpacity).toBe(1);
  });

  it('fades the large title out before the small one fades in (no double title)', () => {
    const mid = headerVisuals(0.65 * D, D);
    expect(mid.largeTitleOpacity).toBe(0);
    expect(mid.barTitleOpacity).toBe(0);
  });

  it('does not scale under reduced motion', () => {
    expect(headerVisuals(D, D, true).largeTitleScale).toBe(1);
  });
});

describe('revealVisuals', () => {
  it('collapsed (y = distance) shows only the chip', () => {
    expect(revealVisuals(D, D)).toEqual({
      tileOpacity: 0,
      tileScale: TILE_MIN_SCALE,
      chipOpacity: 1,
    });
  });

  it('fully revealed (y = 0) shows only the tile', () => {
    expect(revealVisuals(0, D)).toEqual({ tileOpacity: 1, tileScale: 1, chipOpacity: 0 });
  });

  it('overscroll (y < 0) reads as fully revealed', () => {
    expect(revealVisuals(-40, D).tileOpacity).toBe(1);
  });

  it('cross-fades in between', () => {
    const v = revealVisuals(D / 2, D);
    expect(v.tileOpacity).toBe(1);
    expect(v.chipOpacity).toBeCloseTo(0.5);
    const early = revealVisuals(D * 0.8, D);
    expect(early.tileOpacity).toBeCloseTo(0.4);
    expect(early.chipOpacity).toBe(1);
  });

  it('keeps the tile at scale 1 under reduced motion', () => {
    expect(revealVisuals(D * 0.9, D, true).tileScale).toBe(1);
  });

  it('with no distance there is nothing to reveal', () => {
    expect(revealVisuals(0, 0)).toEqual({
      tileOpacity: 0,
      tileScale: TILE_MIN_SCALE,
      chipOpacity: 1,
    });
  });
});

// features/loyalty/brightness.ts — the boost/restore state machine behind
// useBrightnessBoost. Pure (native calls are injected) so the races are tested.

export interface BrightnessDeps {
  /** Current brightness, 0..1. */
  get: () => Promise<number>;
  /** Set brightness, 0..1. */
  set: (value: number) => Promise<void>;
  /** Undo the boost, given the brightness read before it. */
  restore: (original: number) => Promise<void>;
}

export interface BrightnessBoost {
  /** Remember the current brightness (once per boost) and go to max. */
  boost: () => Promise<void>;
  /** Restore the remembered brightness. No-op when nothing was boosted. */
  release: () => Promise<void>;
}

/**
 * Brightness is a nicety: every native failure is swallowed. A `release` that
 * lands while `boost` is still reading the original wins — brightness is then
 * never raised, so nothing is left to restore.
 */
export function createBrightnessBoost(deps: BrightnessDeps): BrightnessBoost {
  let original: number | null = null;
  let active = false;

  async function boost(): Promise<void> {
    active = true;
    try {
      if (original === null) {
        const value = await deps.get();
        if (!active) return;
        original = value;
      }
      await deps.set(1);
    } catch {
      // unsupported device / web — ignore
    }
  }

  async function release(): Promise<void> {
    active = false;
    if (original === null) return;
    const value = original;
    original = null;
    try {
      await deps.restore(value);
    } catch {
      // ignore
    }
  }

  return { boost, release };
}

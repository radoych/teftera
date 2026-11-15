// components/barcodeLayout.ts — pure geometry for <Barcode>. No React / SVG imports.
import type { Modules } from '@/lib/barcode';

/** Consecutive bar modules merged into one rect each: [startModule, runLength][]. */
export function barRuns(modules: Modules): [number, number][] {
  const runs: [number, number][] = [];
  let start = -1;
  modules.forEach((bar, i) => {
    if (bar && start < 0) start = i;
    if (!bar && start >= 0) {
      runs.push([start, i - start]);
      start = -1;
    }
  });
  if (start >= 0) runs.push([start, modules.length - start]);
  return runs;
}

/**
 * Module width: whole pixels, at least 2 so cheap scanners resolve the bars.
 * When even 2 px per module would overflow (a long Code128), fall back to the
 * exact fit — a slightly soft code beats one clipped off the surface.
 */
export function moduleWidthFor(available: number, count: number): number {
  if (count <= 0 || available <= 0) return 0;
  const exact = available / count;
  return exact >= 2 ? Math.floor(exact) : exact;
}

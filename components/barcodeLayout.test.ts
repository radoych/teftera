import { encodeEan13 } from '@/lib/barcode';
import { barRuns, moduleWidthFor } from './barcodeLayout';

describe('barRuns', () => {
  it('merges consecutive bars', () => {
    expect(barRuns([true, true, false, true, false, false, true])).toEqual([
      [0, 2],
      [3, 1],
      [6, 1],
    ]);
  });

  it('handles empty and all-space input', () => {
    expect(barRuns([])).toEqual([]);
    expect(barRuns([false, false])).toEqual([]);
  });

  it('covers exactly the bar modules of a real EAN-13', () => {
    const modules = encodeEan13('5901234123457');
    expect(modules).not.toBeNull();
    const bars = (modules ?? []).filter(Boolean).length;
    const covered = barRuns(modules ?? []).reduce((sum, [, run]) => sum + run, 0);
    expect(covered).toBe(bars);
  });
});

describe('moduleWidthFor', () => {
  it('uses whole pixels when at least 2 fit', () => {
    expect(moduleWidthFor(300, 95)).toBe(3);
    expect(moduleWidthFor(190, 95)).toBe(2);
  });

  it('falls back to an exact fit below 2 px so the code never overflows', () => {
    expect(moduleWidthFor(300, 200)).toBe(1.5);
    expect(moduleWidthFor(300, 200) * 200).toBeLessThanOrEqual(300);
  });

  it('is 0 before the container is measured', () => {
    expect(moduleWidthFor(0, 95)).toBe(0);
    expect(moduleWidthFor(300, 0)).toBe(0);
  });
});

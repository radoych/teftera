import { progressWidthPct } from './ProgressBar';

describe('progressWidthPct', () => {
  it('maps a fraction to a percentage', () => {
    expect(progressWidthPct(0.25)).toBe(25);
  });

  it('clamps above 1 (over budget) to a full bar', () => {
    expect(progressWidthPct(1.4)).toBe(100);
  });

  it('clamps negatives and non-finite input to empty', () => {
    expect(progressWidthPct(-0.5)).toBe(0);
    expect(progressWidthPct(Number.NaN)).toBe(0);
  });

  it('raises tiny shares to the minimum sliver', () => {
    expect(progressWidthPct(0.001, 0.02)).toBe(2);
    expect(progressWidthPct(0, 0.02)).toBe(2);
    expect(progressWidthPct(0.5, 0.02)).toBe(50);
  });
});

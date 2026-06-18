import { mean, scoreTransaction, stdDev, zScore } from './anomaly';

describe('anomaly statistics', () => {
  it('computes mean', () => {
    expect(mean([100, 200, 300])).toBe(200);
  });
  it('computes sample standard deviation', () => {
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 2);
  });
  it('z-score of the mean is 0', () => {
    expect(zScore(200, [100, 200, 300])).toBe(0);
  });
});

describe('scoreTransaction', () => {
  const stable = [1000, 1050, 980, 1020, 1010];

  it('does not flag with too little history', () => {
    expect(scoreTransaction(99999, [1000]).isAnomaly).toBe(false);
  });

  it('flags a wild outlier', () => {
    const res = scoreTransaction(50000, stable);
    expect(res.isAnomaly).toBe(true);
    expect(res.score).toBeGreaterThan(2.5);
    expect(res.reason).toContain('Над');
  });

  it('does not flag a normal amount', () => {
    expect(scoreTransaction(1015, stable).isAnomaly).toBe(false);
  });
});

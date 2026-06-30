import { markerKey } from './alertStore';

describe('markerKey', () => {
  it('is stable and includes household, category, month, threshold', () => {
    expect(markerKey('h1', 'groceries', '2026-06-01', 80)).toBe('budgetAlert:h1:groceries:2026-06-01:80');
  });
  it('differs by threshold', () => {
    expect(markerKey('h1', 'g', '2026-06-01', 80)).not.toBe(markerKey('h1', 'g', '2026-06-01', 100));
  });
  it('differs by month (resets monthly)', () => {
    expect(markerKey('h1', 'g', '2026-06-01', 80)).not.toBe(markerKey('h1', 'g', '2026-07-01', 80));
  });
});

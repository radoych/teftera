import { clampDay, daysInMonth, isoToParts, partsToISO } from './wheelDate';

describe('daysInMonth', () => {
  it('knows month lengths including leap February', () => {
    expect(daysInMonth(2026, 1)).toBe(31); // Jan
    expect(daysInMonth(2026, 2)).toBe(28); // Feb non-leap
    expect(daysInMonth(2024, 2)).toBe(29); // Feb leap
    expect(daysInMonth(2026, 4)).toBe(30); // Apr
  });
});

describe('clampDay', () => {
  it('clamps a day into the valid range for the month', () => {
    expect(clampDay(2026, 2, 31)).toBe(28);
    expect(clampDay(2024, 2, 31)).toBe(29);
    expect(clampDay(2026, 1, 15)).toBe(15);
    expect(clampDay(2026, 1, 0)).toBe(1);
  });
});

describe('partsToISO', () => {
  it('zero-pads and clamps the day', () => {
    expect(partsToISO(2026, 6, 4)).toBe('2026-06-04');
    expect(partsToISO(2026, 2, 31)).toBe('2026-02-28');
  });
});

describe('isoToParts', () => {
  it('round-trips with partsToISO', () => {
    expect(isoToParts('2026-06-24')).toEqual({ year: 2026, month: 6, day: 24 });
    const p = isoToParts('2026-02-15');
    expect(partsToISO(p.year, p.month, p.day)).toBe('2026-02-15');
  });
});

import { isValidISODate, monthAbbr, windowStartISO } from './dates';

describe('isValidISODate', () => {
  it('accepts a real date', () => {
    expect(isValidISODate('2026-06-22')).toBe(true);
  });

  it('rejects a malformed string', () => {
    expect(isValidISODate('2026-6-2')).toBe(false);
    expect(isValidISODate('not-a-date')).toBe(false);
    expect(isValidISODate('')).toBe(false);
  });

  it('rejects an impossible calendar date', () => {
    expect(isValidISODate('2026-02-30')).toBe(false);
    expect(isValidISODate('2026-13-01')).toBe(false);
  });
});

describe('monthAbbr', () => {
  it('maps 0 → ЯНУ and 11 → ДЕК', () => {
    expect(monthAbbr(0)).toBe('ЯНУ');
    expect(monthAbbr(11)).toBe('ДЕК');
  });
  it('wraps out-of-range indices', () => {
    expect(monthAbbr(12)).toBe('ЯНУ');
    expect(monthAbbr(-1)).toBe('ДЕК');
  });
});

describe('windowStartISO', () => {
  it('12-month window from mid-July 2026 starts 2025-08-01', () => {
    expect(windowStartISO(12, new Date(2026, 6, 15))).toBe('2025-08-01');
  });
  it('1-month window is the first of the current month', () => {
    expect(windowStartISO(1, new Date(2026, 6, 15))).toBe('2026-07-01');
  });
});

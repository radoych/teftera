import { isValidISODate, monthAbbr } from './dates';

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

import { formatTime, isValidISODate, monthAbbr, relativeDay, windowStartISO } from './dates';

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

describe('relativeDay / formatTime (cached Intl formatters)', () => {
  const NOW = new Date(2026, 5, 15, 12, 0); // 15 Jun 2026

  it('labels today and yesterday', () => {
    expect(relativeDay('2026-06-15', NOW)).toBe('Днес');
    expect(relativeDay('2026-06-14', NOW)).toBe('Вчера');
  });

  it('formats same-year and other-year dates with the matching variant', () => {
    const sameYear = new Intl.DateTimeFormat('bg-BG', { day: 'numeric', month: 'short' });
    const otherYear = new Intl.DateTimeFormat('bg-BG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    expect(relativeDay('2026-06-01', NOW)).toBe(sameYear.format(new Date(2026, 5, 1)));
    expect(relativeDay('2025-12-31', NOW)).toBe(otherYear.format(new Date(2025, 11, 31)));
    // Interleaving the two variants must not leak one into the other.
    expect(relativeDay('2026-06-01', NOW)).toBe(sameYear.format(new Date(2026, 5, 1)));
  });

  it('formats time as 2-digit hour:minute', () => {
    const expected = new Intl.DateTimeFormat('bg-BG', { hour: '2-digit', minute: '2-digit' });
    const d = new Date(2026, 5, 15, 9, 5);
    expect(formatTime(d)).toBe(expected.format(d));
  });

  it('constructs no new formatter on repeated calls', () => {
    // Warm every lazy singleton first.
    formatTime(NOW);
    relativeDay('2026-06-01', NOW);
    relativeDay('2025-06-01', NOW);
    const spy = jest.spyOn(Intl, 'DateTimeFormat');
    try {
      for (let i = 0; i < 5; i++) {
        formatTime(NOW);
        relativeDay('2026-06-01', NOW);
        relativeDay('2025-06-01', NOW);
      }
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

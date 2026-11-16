import {
  firstOfMonth,
  formatTime,
  isInMonth,
  isValidISODate,
  monthAbbr,
  monthBounds,
  monthKey,
  monthName,
  relativeDay,
  startOfMonth,
  sumInMonth,
  toISODate,
  windowStartISO,
} from './dates';

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

describe('month toolkit', () => {
  const NOW = new Date(2026, 5, 22); // 22 Jun 2026, local

  it('monthKey is zero-padded YYYY-MM in local time', () => {
    expect(monthKey(NOW)).toBe('2026-06');
    expect(monthKey(new Date(2026, 0, 1))).toBe('2026-01');
    expect(monthKey(new Date(2025, 11, 31, 23, 59))).toBe('2025-12');
  });

  it('startOfMonth shifts by whole months across year boundaries', () => {
    expect(toISODate(startOfMonth(NOW))).toBe('2026-06-01');
    expect(toISODate(startOfMonth(NOW, -1))).toBe('2026-05-01');
    expect(toISODate(startOfMonth(new Date(2026, 0, 15), -1))).toBe('2025-12-01');
    expect(toISODate(startOfMonth(new Date(2026, 11, 31), 1))).toBe('2027-01-01');
  });

  it('firstOfMonth agrees with monthKey', () => {
    expect(firstOfMonth(NOW)).toBe(`${monthKey(NOW)}-01`);
  });

  it('monthBounds are inclusive first/last day, leap-year aware', () => {
    expect(monthBounds(NOW)).toEqual({ startISO: '2026-06-01', endISO: '2026-06-30' });
    expect(monthBounds(new Date(2028, 1, 10))).toEqual({ startISO: '2028-02-01', endISO: '2028-02-29' });
    expect(monthBounds(new Date(2026, 11, 5))).toEqual({ startISO: '2026-12-01', endISO: '2026-12-31' });
  });

  it('isInMonth matches only dates of that calendar month', () => {
    expect(isInMonth('2026-06-01', NOW)).toBe(true);
    expect(isInMonth('2026-06-30', NOW)).toBe(true);
    expect(isInMonth('2026-05-31', NOW)).toBe(false);
    expect(isInMonth('2026-07-01', NOW)).toBe(false);
    expect(isInMonth('2025-06-15', NOW)).toBe(false);
  });

  // Cases carried over from the former monthTotalCents / prevMonthTotalCents tests.
  const row = (date: string, amount_eur: number) => ({ date, amount_eur });

  it('sumInMonth sums only the given calendar month', () => {
    expect(
      sumInMonth([row('2026-06-01', 500), row('2026-06-30', 1500), row('2026-05-31', 9999)], NOW),
    ).toBe(2000);
  });

  it('sumInMonth for the previous month excludes the current and older months', () => {
    expect(
      sumInMonth(
        [row('2026-05-01', 500), row('2026-05-31', 1500), row('2026-06-01', 9999), row('2026-04-30', 8888)],
        startOfMonth(NOW, -1),
      ),
    ).toBe(2000);
  });

  it('sumInMonth rolls back across the year boundary', () => {
    const jan = new Date(2026, 0, 15);
    expect(sumInMonth([row('2025-12-25', 700), row('2026-01-02', 9999)], startOfMonth(jan, -1))).toBe(700);
  });

  it('sumInMonth is zero for no rows', () => {
    expect(sumInMonth([], NOW)).toBe(0);
  });
});

describe('monthName', () => {
  it('returns the lowercase BG month name', () => {
    expect(monthName(0)).toBe('януари');
    expect(monthName(10)).toBe('ноември');
    expect(monthName(11)).toBe('декември');
  });

  it('wraps out-of-range indexes', () => {
    expect(monthName(12)).toBe('януари');
    expect(monthName(-1)).toBe('декември');
  });
});

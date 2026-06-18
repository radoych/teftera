import {
  BGN_PER_EUR,
  bgnToEurCents,
  eurToBgnCents,
  formatCurrency,
  parseAmountToCents,
} from './formatCurrency';

describe('formatCurrency', () => {
  it('formats euro-cents with a euro symbol and bg-BG decimal comma', () => {
    const out = formatCurrency(14250);
    expect(out).toContain('€');
    expect(out).toContain('142,50');
    expect(out).not.toContain('$');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toContain('0,00');
  });

  it('formats negative amounts', () => {
    expect(formatCurrency(-500)).toContain('5,00');
    expect(formatCurrency(-500)).toContain('-');
  });

  it('never renders USD/$', () => {
    expect(formatCurrency(99999)).not.toContain('$');
  });
});

describe('BGN <-> EUR conversion', () => {
  it('uses the fixed official rate', () => {
    expect(BGN_PER_EUR).toBe(1.95583);
  });

  it('converts BGN stotinki to EUR cents (round)', () => {
    // 195583 stotinki (1955.83 BGN) = exactly 1000.00 EUR
    expect(bgnToEurCents(195583)).toBe(100000);
  });

  it('round-trips approximately', () => {
    const eur = 5000; // 50.00 EUR
    const bgn = eurToBgnCents(eur);
    expect(bgnToEurCents(bgn)).toBe(eur);
  });
});

describe('parseAmountToCents', () => {
  it('parses comma decimals', () => {
    expect(parseAmountToCents('12,50')).toBe(1250);
  });
  it('parses dot decimals', () => {
    expect(parseAmountToCents('12.50')).toBe(1250);
  });
  it('handles whole numbers', () => {
    expect(parseAmountToCents('100')).toBe(10000);
  });
  it('rejects garbage', () => {
    expect(parseAmountToCents('abc')).toBeNull();
    expect(parseAmountToCents('')).toBeNull();
  });
});

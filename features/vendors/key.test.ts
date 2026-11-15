import { merchantKey } from './key';

describe('merchantKey', () => {
  it('lowercases, collapses inner whitespace and trims', () => {
    expect(merchantKey('  KAUFLAND   Bulgaria ')).toBe('kaufland bulgaria');
  });

  it('is Cyrillic-safe', () => {
    expect(merchantKey('Кауфланд')).toBe('кауфланд');
  });

  it('folds full-width characters (NFKC)', () => {
    expect(merchantKey('ＫＡＵＦ')).toBe('kauf');
  });

  it('treats tabs / newlines as whitespace', () => {
    expect(merchantKey('Billa\t\nSofia')).toBe('billa sofia');
  });

  it('maps blank input to the empty key', () => {
    expect(merchantKey('')).toBe('');
    expect(merchantKey('   ')).toBe('');
  });
});

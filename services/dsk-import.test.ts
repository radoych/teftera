import {
  cleanMerchant,
  normalizeDskRow,
  parseBgAmount,
  parseDskDate,
} from './dsk-import';

describe('DSK normalization', () => {
  it('parses Bulgarian amounts', () => {
    expect(parseBgAmount('1 234,56')).toBe(123456);
    expect(parseBgAmount('-45,00')).toBe(-4500);
    expect(parseBgAmount('12,50')).toBe(1250);
  });

  it('parses DSK dates to ISO', () => {
    expect(parseDskDate('05.03.2024')).toBe('2024-03-05');
  });

  it('cleans merchant whitespace', () => {
    expect(cleanMerchant('  LIDL   SOFIA  ')).toBe('LIDL SOFIA');
  });

  it('normalizes a full row with BGN→EUR and category guess', () => {
    const out = normalizeDskRow({
      amount: '-1 955,83',
      date: '01.02.2024',
      description: 'LIDL  Sofia',
    });
    expect(out.originalCurrency).toBe('BGN');
    expect(out.originalAmountCents).toBe(195583);
    expect(out.amountEurCents).toBe(100000); // 1955.83 BGN = 1000.00 EUR
    expect(out.date).toBe('2024-02-01');
    expect(out.categoryGuess).toBe('Groceries');
  });
});

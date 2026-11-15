import {
  EAN_G_CODES,
  EAN_L_CODES,
  EAN_PARITY,
  EAN_R_CODES,
  eanCheckDigit,
  encodeEan13,
  encodeEan8,
  isValidEan13,
  isValidEan8,
  upcAToEan13,
} from './ean';

const bits = (modules: boolean[]): string => modules.map((m) => (m ? '1' : '0')).join('');
const barRuns = (block: string): number => (block.match(/1+/g) ?? []).length;

describe('EAN tables self-check', () => {
  it('L codes are 7 modules, start with a space, end with a bar, odd parity, unique', () => {
    expect(EAN_L_CODES).toHaveLength(10);
    EAN_L_CODES.forEach((c) => {
      expect(c).toMatch(/^0[01]{5}1$/);
      expect(c.replace(/0/g, '').length % 2).toBe(1);
      expect(barRuns(c)).toBe(2);
    });
    expect(new Set(EAN_L_CODES).size).toBe(10);
  });

  it('derived R and G codes match the standard (independent transcription)', () => {
    expect(EAN_R_CODES).toEqual([
      '1110010',
      '1100110',
      '1101100',
      '1000010',
      '1011100',
      '1001110',
      '1010000',
      '1000100',
      '1001000',
      '1110100',
    ]);
    expect(EAN_G_CODES).toEqual([
      '0100111',
      '0110011',
      '0011011',
      '0100001',
      '0011101',
      '0111001',
      '0000101',
      '0010001',
      '0001001',
      '0010111',
    ]);
  });

  it('parity patterns start with L, are unique, and use three G (except 0)', () => {
    expect(EAN_PARITY[0]).toBe('LLLLLL');
    EAN_PARITY.slice(1).forEach((p) => {
      expect(p).toMatch(/^L[LG]{5}$/);
      expect(p.replace(/L/g, '').length).toBe(3);
    });
    expect(new Set(EAN_PARITY).size).toBe(10);
  });
});

describe('eanCheckDigit / validation', () => {
  it('computes the EAN-13 check digit', () => {
    expect(eanCheckDigit('590123412345')).toBe(7);
    expect(eanCheckDigit('400638133393')).toBe(1);
  });

  it('computes the EAN-8 check digit', () => {
    expect(eanCheckDigit('9638507')).toBe(4);
  });

  it('validates EAN-13', () => {
    expect(isValidEan13('5901234123457')).toBe(true);
    expect(isValidEan13('5901234123458')).toBe(false);
    expect(isValidEan13('4006381333931')).toBe(true);
    expect(isValidEan13('590123412345')).toBe(false);
    expect(isValidEan13('590123412345a')).toBe(false);
  });

  it('validates EAN-8', () => {
    expect(isValidEan8('96385074')).toBe(true);
    expect(isValidEan8('96385075')).toBe(false);
    expect(isValidEan8('9638507')).toBe(false);
  });

  it('converts UPC-A to EAN-13', () => {
    expect(upcAToEan13('036000291452')).toBe('0036000291452');
    expect(isValidEan13('0036000291452')).toBe(true);
    expect(upcAToEan13('036000291453')).toBeNull();
    expect(upcAToEan13('12345')).toBeNull();
  });
});

describe('encodeEan13', () => {
  const m = encodeEan13('5901234123457');

  it('is 95 modules with guards', () => {
    expect(m).not.toBeNull();
    const b = bits(m!);
    expect(b).toHaveLength(95);
    expect(b.slice(0, 3)).toBe('101');
    expect(b.slice(45, 50)).toBe('01010');
    expect(b.slice(-3)).toBe('101');
  });

  it('every 7-module digit block contains exactly two bar runs', () => {
    const b = bits(m!);
    const left = b.slice(3, 45);
    const right = b.slice(50, 92);
    for (let i = 0; i < 6; i++) {
      expect(barRuns(left.slice(i * 7, i * 7 + 7))).toBe(2);
      expect(barRuns(right.slice(i * 7, i * 7 + 7))).toBe(2);
    }
  });

  it('encodes the first digit through the left-half parity', () => {
    // First digit 5 → LGGLLG; second digit 9 is L, third digit 0 is G.
    const b = bits(m!);
    expect(b.slice(3, 10)).toBe(EAN_L_CODES[9]);
    expect(b.slice(10, 17)).toBe(EAN_G_CODES[0]);
    expect(b.slice(50, 57)).toBe(EAN_R_CODES[1]);
  });

  it('rejects invalid input', () => {
    expect(encodeEan13('5901234123458')).toBeNull();
    expect(encodeEan13('abc')).toBeNull();
  });
});

describe('encodeEan8', () => {
  it('is 67 modules with guards', () => {
    const m = encodeEan8('96385074');
    expect(m).not.toBeNull();
    const b = bits(m!);
    expect(b).toHaveLength(67);
    expect(b.slice(0, 3)).toBe('101');
    expect(b.slice(31, 36)).toBe('01010');
    expect(b.slice(-3)).toBe('101');
    expect(b.slice(3, 10)).toBe(EAN_L_CODES[9]);
    expect(b.slice(36, 43)).toBe(EAN_R_CODES[5]);
  });

  it('rejects invalid input', () => {
    expect(encodeEan8('96385075')).toBeNull();
  });
});

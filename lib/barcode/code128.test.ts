import {
  CODE128_PATTERNS,
  CODE128_START_B,
  CODE128_START_C,
  CODE128_STOP,
  code128Values,
  encodeCode128,
} from './code128';

const widthsToBits = (widths: string): string =>
  widths
    .split('')
    .map((w, i) => (i % 2 === 0 ? '1' : '0').repeat(Number(w)))
    .join('');

const bits = (modules: boolean[]): string => modules.map((m) => (m ? '1' : '0')).join('');

describe('CODE128_PATTERNS table self-check', () => {
  it('has 106 symbols plus the stop pattern', () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
  });

  it('every symbol is 6 widths of 1–4 summing to 11 modules', () => {
    CODE128_PATTERNS.slice(0, 106).forEach((p) => {
      expect(p).toMatch(/^[1-4]{6}$/);
      expect(p.split('').reduce((s, w) => s + Number(w), 0)).toBe(11);
    });
  });

  it('bar widths of every symbol sum to an even number (Code128 parity property)', () => {
    CODE128_PATTERNS.slice(0, 106).forEach((p) => {
      const bars = Number(p[0]) + Number(p[2]) + Number(p[4]);
      expect(bars % 2).toBe(0);
    });
  });

  it('every symbol is unique', () => {
    expect(new Set(CODE128_PATTERNS).size).toBe(CODE128_PATTERNS.length);
  });

  it('stop pattern is 2331112 (13 modules)', () => {
    expect(CODE128_PATTERNS[CODE128_STOP]).toBe('2331112');
  });

  it('spot-checks well-known symbols', () => {
    expect(widthsToBits(CODE128_PATTERNS[CODE128_START_B]!)).toBe('11010010000');
    expect(widthsToBits(CODE128_PATTERNS[CODE128_START_C]!)).toBe('11010011100');
    expect(widthsToBits(CODE128_PATTERNS[33]!)).toBe('10100011000'); // 'A' in set B
    expect(widthsToBits(CODE128_PATTERNS[0]!)).toBe('11011001100'); // space / "00"
  });
});

describe('code128Values', () => {
  it('uses subset B for text', () => {
    expect(code128Values('ABC')).toEqual([104, 33, 34, 35]);
  });

  it('uses subset C for an even count of digits', () => {
    expect(code128Values('1234')).toEqual([105, 12, 34]);
  });

  it('switches to C for a run of 4+ digits and back to B', () => {
    expect(code128Values('AB1234CD')).toEqual([104, 33, 34, 99, 12, 34, 100, 35, 36]);
  });

  it('keeps short digit runs in B', () => {
    expect(code128Values('A12B')).toEqual([104, 33, 17, 18, 34]);
  });

  it('encodes the odd leading digit of a mid-stream run in B', () => {
    expect(code128Values('A12345')).toEqual([104, 33, 17, 99, 23, 45]);
  });

  it('starts in C for a leading run and finishes an odd run in B', () => {
    expect(code128Values('12345')).toEqual([105, 12, 34, 100, 21]);
    expect(code128Values('1234AB')).toEqual([105, 12, 34, 100, 33, 34]);
  });

  it('keeps short all-digit odd values in B', () => {
    expect(code128Values('123')).toEqual([104, 17, 18, 19]);
  });

  it('rejects empty and non-printable-ASCII input', () => {
    expect(code128Values('')).toBeNull();
    expect(code128Values('é')).toBeNull();
    expect(code128Values('A\tB')).toBeNull();
  });
});

describe('encodeCode128', () => {
  it('encodes ABC: Start B, data, checksum 1, stop', () => {
    const m = encodeCode128('ABC');
    expect(m).not.toBeNull();
    expect(m).toHaveLength(5 * 11 + 13);
    const b = bits(m!);
    expect(b.slice(0, 11)).toBe('11010010000');
    // (104 + 33·1 + 34·2 + 35·3) mod 103 = 1
    expect(b.slice(44, 55)).toBe(widthsToBits(CODE128_PATTERNS[1]!));
    expect(b.slice(-13)).toBe(widthsToBits('2331112'));
  });

  it('encodes 1234 with Start C', () => {
    const m = encodeCode128('1234');
    expect(m).toHaveLength((1 + 2 + 1) * 11 + 13);
    expect(bits(m!).slice(0, 11)).toBe('11010011100');
  });

  it('encodes AB1234CD with switches', () => {
    // start + 8 data/shift symbols + checksum, then stop
    expect(encodeCode128('AB1234CD')).toHaveLength(10 * 11 + 13);
  });

  it('starts with a bar and ends with a bar', () => {
    const m = encodeCode128('Teftera 2026')!;
    expect(m[0]).toBe(true);
    expect(m[m.length - 1]).toBe(true);
  });

  it('returns null for unsupported input', () => {
    expect(encodeCode128('é')).toBeNull();
    expect(encodeCode128('')).toBeNull();
  });
});

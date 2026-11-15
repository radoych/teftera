import type { Modules } from './types';

// Code 128 encoder (subsets B and C). Pure — no Expo / RN imports.
//
// Symbol table: index = symbol value, entry = six alternating bar/space
// widths (bar first), each symbol 11 modules wide. Index 106 is the 7-width,
// 13-module stop pattern. Transcribed from ISO/IEC 15417 and guarded by the
// table self-check tests (widths sum, bar-parity, uniqueness).
// prettier-ignore
export const CODE128_PATTERNS: readonly string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', // 0–9
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', // 10–19
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', // 20–29
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', // 30–39
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', // 40–49
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', // 50–59
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', // 60–69
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', // 70–79
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', // 80–89
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', // 90–99
  '114131', '311141', '411131', '211412', '211214', '211232', // 100–105
  '2331112', // 106 stop
];

export const CODE128_CODE_C = 99; // in subset B: switch to C
export const CODE128_CODE_B = 100; // in subset C: switch to B
export const CODE128_START_B = 104;
export const CODE128_START_C = 105;
export const CODE128_STOP = 106;

/** Minimum digit run worth switching to subset C for mid-stream. */
const MIN_C_RUN = 4;

const isPrintableAscii = (s: string): boolean => /^[\x20-\x7e]+$/.test(s);

const pairValues = (digits: string): number[] => {
  const out: number[] = [];
  for (let i = 0; i + 1 < digits.length; i += 2) out.push(Number(digits.slice(i, i + 2)));
  return out;
};

const bValue = (ch: string): number => ch.charCodeAt(0) - 32;

/**
 * Symbol values (start code + data + shift codes), without checksum and stop.
 * Returns null for empty input or anything outside printable ASCII 32–126.
 */
export function code128Values(value: string): number[] | null {
  if (!isPrintableAscii(value)) return null;

  // Tokenise into digit runs and other text, preserving order.
  const tokens = value.match(/\d+|\D+/g) ?? [];
  const out: number[] = [];
  let set: 'B' | 'C';

  const first = tokens[0] ?? '';
  if (
    /^\d+$/.test(first) &&
    (first.length >= MIN_C_RUN || (tokens.length === 1 && first.length % 2 === 0))
  ) {
    // Leading digit run → start directly in C. An odd trailing digit drops to B.
    out.push(CODE128_START_C);
    const even = first.length - (first.length % 2);
    out.push(...pairValues(first.slice(0, even)));
    set = 'C';
    if (even < first.length) {
      out.push(CODE128_CODE_B, bValue(first.slice(even)));
      set = 'B';
    }
  } else {
    out.push(CODE128_START_B);
    for (const ch of first) out.push(bValue(ch));
    set = 'B';
  }

  for (const token of tokens.slice(1)) {
    const isDigits = /^\d+$/.test(token);
    if (isDigits && token.length >= MIN_C_RUN) {
      let digits = token;
      if (set === 'B') {
        if (digits.length % 2 === 1) {
          out.push(bValue(digits[0]!));
          digits = digits.slice(1);
        }
        out.push(CODE128_CODE_C);
        set = 'C';
      }
      out.push(...pairValues(digits));
    } else {
      if (set === 'C') {
        out.push(CODE128_CODE_B);
        set = 'B';
      }
      for (const ch of token) out.push(bValue(ch));
    }
  }
  return out;
}

const widthsToModules = (widths: string, into: Modules): void => {
  for (let i = 0; i < widths.length; i++) {
    const bar = i % 2 === 0;
    for (let n = Number(widths[i]); n > 0; n--) into.push(bar);
  }
};

/** Encodes `value` as Code 128 modules (true = bar), or null when unsupported. */
export function encodeCode128(value: string): Modules | null {
  const values = code128Values(value);
  if (!values) return null;

  const [start, ...data] = values;
  const checksum = data.reduce((sum, v, i) => sum + v * (i + 1), start!) % 103;

  const modules: Modules = [];
  for (const v of [...values, checksum, CODE128_STOP])
    widthsToModules(CODE128_PATTERNS[v]!, modules);
  return modules;
}

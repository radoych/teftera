import type { Modules } from './types';

// EAN-13 / EAN-8 encoder. Pure — no Expo / RN imports.
//
// Only the L (odd-parity) set is transcribed; R is its bitwise complement and
// G is R reversed, so the other two sets cannot drift from it. The tests
// cross-check both derived sets against an independent transcription.

/** L-codes (left half, odd parity), index = digit. */
// prettier-ignore
export const EAN_L_CODES: readonly string[] = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011',
];

const complement = (bits: string): string =>
  bits.replace(/[01]/g, (b) => (b === '0' ? '1' : '0'));

/** R-codes (right half). */
export const EAN_R_CODES: readonly string[] = EAN_L_CODES.map(complement);

/** G-codes (left half, even parity). */
export const EAN_G_CODES: readonly string[] = EAN_R_CODES.map((c) =>
  c.split('').reverse().join(''),
);

/** EAN-13 left-half parity per leading (13th) digit. */
// prettier-ignore
export const EAN_PARITY: readonly string[] = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
];

const GUARD = '101';
const CENTER = '01010';

const isDigits = (s: string, length: number): boolean =>
  s.length === length && /^\d+$/.test(s);

/**
 * GS1 mod-10 check digit for an EAN-13 (12-digit), EAN-8 (7-digit) or
 * UPC-A (11-digit) payload: weights 3,1,3,… starting from the RIGHTMOST
 * payload digit.
 */
export function eanCheckDigit(payload: string): number {
  let sum = 0;
  for (let i = 0; i < payload.length; i++) {
    const digit = Number(payload[payload.length - 1 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

const hasValidCheck = (code: string): boolean =>
  eanCheckDigit(code.slice(0, -1)) === Number(code[code.length - 1]);

export const isValidEan13 = (code: string): boolean =>
  isDigits(code, 13) && hasValidCheck(code);
export const isValidEan8 = (code: string): boolean =>
  isDigits(code, 8) && hasValidCheck(code);

/** A valid 12-digit UPC-A is an EAN-13 with a leading 0; null when invalid. */
export function upcAToEan13(code: string): string | null {
  if (!isDigits(code, 12) || !hasValidCheck(code)) return null;
  return `0${code}`;
}

const toModules = (bits: string): Modules => bits.split('').map((b) => b === '1');

/** 95 modules: guard, 6 left digits (L/G by first digit), center, 6 right (R), guard. */
export function encodeEan13(code: string): Modules | null {
  if (!isValidEan13(code)) return null;
  const digits = code.split('').map(Number);
  const parity = EAN_PARITY[digits[0]!]!;
  let bits = GUARD;
  for (let i = 1; i <= 6; i++) {
    const table = parity[i - 1] === 'G' ? EAN_G_CODES : EAN_L_CODES;
    bits += table[digits[i]!]!;
  }
  bits += CENTER;
  for (let i = 7; i <= 12; i++) bits += EAN_R_CODES[digits[i]!]!;
  bits += GUARD;
  return toModules(bits);
}

/** 67 modules: guard, 4 left digits (L), center, 4 right (R), guard. */
export function encodeEan8(code: string): Modules | null {
  if (!isValidEan8(code)) return null;
  const digits = code.split('').map(Number);
  let bits = GUARD;
  for (let i = 0; i < 4; i++) bits += EAN_L_CODES[digits[i]!]!;
  bits += CENTER;
  for (let i = 4; i < 8; i++) bits += EAN_R_CODES[digits[i]!]!;
  bits += GUARD;
  return toModules(bits);
}

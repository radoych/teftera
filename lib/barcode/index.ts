import { encodeCode128 } from './code128';
import { encodeEan13, encodeEan8 } from './ean';
import type { BarcodeFormat, Modules } from './types';

export type { BarcodeFormat, Modules } from './types';
export { encodeCode128 } from './code128';
export { eanCheckDigit, encodeEan13, encodeEan8, isValidEan13, isValidEan8, upcAToEan13 } from './ean';

/**
 * Encodes `value` in `format`. Returns null for QR (drawn by
 * react-native-qrcode-svg, not as modules) and for values the format cannot
 * represent — callers fall back to showing the code as text. Never throws.
 */
export function encodeBarcode(value: string, format: BarcodeFormat): Modules | null {
  switch (format) {
    case 'ean13':
      return encodeEan13(value);
    case 'ean8':
      return encodeEan8(value);
    case 'code128':
      return encodeCode128(value);
    case 'qr':
      return null;
  }
}

// features/loyalty/format.ts — pure code-format detection / normalization / display.
// Must not import Expo modules (spec §3): it is unit-tested in plain Node.
import { isValidEan13, isValidEan8, upcAToEan13, type BarcodeFormat } from '@/lib/barcode';

export interface DetectedCode {
  code: string;
  format: BarcodeFormat;
}

/** The format `SegmentedToggle` in the card form: [EAN][Code128][QR]. */
export type FormatGroup = 'ean' | 'code128' | 'qr';

const PRINTABLE_ASCII = /^[\x20-\x7e]*$/;
const DIGITS = /^\d+$/;

/**
 * Best-guess symbology for a typed or scanned value (spec §7.4).
 * Spaces are stripped for the 1-D formats (they are only display grouping on
 * printed cards); a QR payload keeps its inner spaces and is only trimmed,
 * because there they are data.
 */
export function detectCodeFormat(raw: string): DetectedCode {
  const compact = raw.replace(/\s+/g, '');
  if (DIGITS.test(compact)) {
    if (compact.length === 13 && isValidEan13(compact)) return { code: compact, format: 'ean13' };
    if (compact.length === 12) {
      const ean = upcAToEan13(compact);
      if (ean) return { code: ean, format: 'ean13' };
    }
    if (compact.length === 8 && isValidEan8(compact)) return { code: compact, format: 'ean8' };
  }
  if (PRINTABLE_ASCII.test(compact)) return { code: compact, format: 'code128' };
  return { code: raw.trim(), format: 'qr' };
}

/** Canonical stored form: digits only for EAN, trimmed otherwise. */
export function normalizeCode(raw: string, format: BarcodeFormat): string {
  return format === 'ean13' || format === 'ean8' ? raw.replace(/\D/g, '') : raw.trim();
}

/** Human-readable grouping: EAN-13 → `5 901234 123457`; everything else unchanged. */
export function displayCode(code: string, format: BarcodeFormat): string {
  if (format === 'ean13' && code.length === 13 && DIGITS.test(code)) {
    return `${code.slice(0, 1)} ${code.slice(1, 7)} ${code.slice(7)}`;
  }
  return code;
}

/** Tile-safe masked code: `•••• 3457`. Codes of four characters or fewer are shown as-is. */
export function maskCode(code: string): string {
  return code.length <= 4 ? code : `•••• ${code.slice(-4)}`;
}

/**
 * Map an expo-camera scan (`BarcodeScanningResult.type`, `.data`) to a stored
 * code + format. EAN payloads that fail validation and unknown symbologies fall
 * back to `detectCodeFormat` so a scan never produces an unrenderable card.
 */
export function fromScannerResult(type: string, data: string): DetectedCode {
  switch (type) {
    case 'ean13': {
      const code = normalizeCode(data, 'ean13');
      return isValidEan13(code) ? { code, format: 'ean13' } : detectCodeFormat(data);
    }
    case 'ean8': {
      const code = normalizeCode(data, 'ean8');
      return isValidEan8(code) ? { code, format: 'ean8' } : detectCodeFormat(data);
    }
    case 'upc_a': {
      const ean = upcAToEan13(normalizeCode(data, 'ean13'));
      return ean ? { code: ean, format: 'ean13' } : detectCodeFormat(data);
    }
    case 'code128':
      return { code: normalizeCode(data, 'code128'), format: 'code128' };
    case 'qr':
      return { code: normalizeCode(data, 'qr'), format: 'qr' };
    default:
      return detectCodeFormat(data);
  }
}

/** Which toggle segment a stored format belongs to. */
export function formatGroup(format: BarcodeFormat): FormatGroup {
  return format === 'ean13' || format === 'ean8' ? 'ean' : format;
}

/** Concrete format for a toggle segment: the EAN segment picks EAN-8 for 8 digits, else EAN-13. */
export function formatForGroup(group: FormatGroup, code: string): BarcodeFormat {
  if (group !== 'ean') return group;
  return code.replace(/\D/g, '').length === 8 ? 'ean8' : 'ean13';
}

/**
 * The code + format a card form would save. `group` null = the user has not
 * picked a format, so it is auto-detected; otherwise the picked segment wins,
 * but detection is still used when it agrees (so a UPC-A typed under [EAN]
 * still gains its leading 0).
 */
export function resolveDraftCode(raw: string, group: FormatGroup | null): DetectedCode {
  const detected = detectCodeFormat(raw);
  if (group === null || formatGroup(detected.format) === group) return detected;
  const format = formatForGroup(group, raw);
  return { code: normalizeCode(raw, format), format };
}

/**
 * Initial format choice when editing a stored card: null (keep auto-detecting)
 * when the stored format is what detection would pick anyway, else the stored
 * format's segment (the user chose it deliberately).
 */
export function initialFormatChoice(code: string, format: BarcodeFormat): FormatGroup | null {
  return detectCodeFormat(code).format === format ? null : formatGroup(format);
}

// features/loyalty/formatSamples.ts — pure data for the format picker tiles.
// No React / Expo imports: unit-tested in plain Node.
import { encodeCode128, encodeEan13, type Modules } from '@/lib/barcode';
import type { FormatGroup } from './format';

export const EAN_SAMPLE = '5901234123457';
export const CODE128_SAMPLE = 'AB-1029';

export const FORMAT_HINTS: Record<FormatGroup, { label: string; text: string }> = {
  ean: {
    label: 'EAN',
    text: 'Черти с еднаква височина, отдолу 13 (или 8) цифри. Най-честият формат на картите в магазините.',
  },
  code128: {
    label: 'Code128',
    text: 'По-гъсти, неравни черти. Може да има и букви, не само цифри.',
  },
  qr: {
    label: 'QR',
    text: 'Квадрат от точки с три големи квадрата в ъглите.',
  },
};

export const FORMAT_ORDER: readonly FormatGroup[] = ['ean', 'code128', 'qr'];

export function eanSampleModules(): Modules {
  return encodeEan13(EAN_SAMPLE) ?? [];
}

export function code128SampleModules(): Modules {
  return encodeCode128(CODE128_SAMPLE) ?? [];
}

/** Side length (cells) of the static QR illustration. */
export const QR_GRID = 21;
const FINDER = 7;

/** True when the cell belongs to one of the three finder areas (incl. separator). */
export function isFinderCell(x: number, y: number, n: number = QR_GRID): boolean {
  const near = (v: number) => v < FINDER + 1;
  const far = (v: number) => v >= n - FINDER - 1;
  return (near(x) && near(y)) || (far(x) && near(y)) || (near(x) && far(y));
}

/** Deterministic pseudo-random data cells (x, y), finder areas excluded. */
export function qrDataCells(n: number = QR_GRID): [number, number][] {
  const cells: [number, number][] = [];
  let seed = 7;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      if (!isFinderCell(x, y, n) && (seed >> 16) % 2 === 0) cells.push([x, y]);
    }
  }
  return cells;
}

/** Finder top-left corners (cells). */
export function qrFinderOrigins(n: number = QR_GRID): [number, number][] {
  return [
    [0, 0],
    [n - FINDER, 0],
    [0, n - FINDER],
  ];
}

export type TooltipAnchor = 'left' | 'center' | 'right';

/** Keep the bubble inside the sheet: first tile anchors left, last right. */
export function tooltipAnchor(index: number, count: number): TooltipAnchor {
  if (index <= 0) return 'left';
  if (index >= count - 1) return 'right';
  return 'center';
}

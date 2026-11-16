import { encodeBarcode } from '@/lib/barcode';
import {
  CODE128_SAMPLE,
  EAN_SAMPLE,
  FORMAT_HINTS,
  FORMAT_ORDER,
  QR_GRID,
  code128SampleModules,
  eanSampleModules,
  isFinderCell,
  qrDataCells,
  tooltipAnchor,
} from './formatSamples';

describe('format samples', () => {
  it('encodes the EAN and Code128 samples', () => {
    expect(eanSampleModules()).toEqual(encodeBarcode(EAN_SAMPLE, 'ean13'));
    expect(eanSampleModules()).toHaveLength(95);
    expect(code128SampleModules().length).toBeGreaterThan(0);
    expect(code128SampleModules()).toEqual(encodeBarcode(CODE128_SAMPLE, 'code128'));
  });

  it('has a hint for every format', () => {
    for (const g of FORMAT_ORDER) {
      expect(FORMAT_HINTS[g].text.length).toBeGreaterThan(10);
    }
  });

  it('QR data cells avoid finder areas and are deterministic', () => {
    const cells = qrDataCells();
    expect(cells.length).toBeGreaterThan(50);
    expect(cells.every(([x, y]) => !isFinderCell(x, y) && x < QR_GRID && y < QR_GRID)).toBe(true);
    expect(qrDataCells()).toEqual(cells);
    expect(isFinderCell(QR_GRID - 1, QR_GRID - 1)).toBe(false);
  });

  it('anchors edge tooltips inward', () => {
    expect(tooltipAnchor(0, 3)).toBe('left');
    expect(tooltipAnchor(1, 3)).toBe('center');
    expect(tooltipAnchor(2, 3)).toBe('right');
  });
});

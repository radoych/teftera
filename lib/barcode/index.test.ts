import { encodeBarcode } from './index';

describe('encodeBarcode', () => {
  it('dispatches to the 1-D encoders', () => {
    expect(encodeBarcode('5901234123457', 'ean13')).toHaveLength(95);
    expect(encodeBarcode('96385074', 'ean8')).toHaveLength(67);
    expect(encodeBarcode('ABC', 'code128')).toHaveLength(68);
  });

  it('returns null for QR (rendered separately) and for invalid codes', () => {
    expect(encodeBarcode('anything', 'qr')).toBeNull();
    expect(encodeBarcode('5901234123458', 'ean13')).toBeNull();
    expect(encodeBarcode('é', 'code128')).toBeNull();
  });
});

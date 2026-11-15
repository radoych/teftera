import {
  detectCodeFormat,
  displayCode,
  formatForGroup,
  formatGroup,
  fromScannerResult,
  initialFormatChoice,
  maskCode,
  normalizeCode,
  resolveDraftCode,
} from './format';

describe('resolveDraftCode', () => {
  it('auto-detects when no format was picked', () => {
    expect(resolveDraftCode('036000291452', null)).toEqual({
      code: '0036000291452',
      format: 'ean13',
    });
  });

  it('uses detection when it agrees with the picked group', () => {
    expect(resolveDraftCode('036000291452', 'ean')).toEqual({
      code: '0036000291452',
      format: 'ean13',
    });
    expect(resolveDraftCode('9638 5074', 'ean')).toEqual({ code: '96385074', format: 'ean8' });
  });

  it('forces the picked format when detection disagrees', () => {
    expect(resolveDraftCode('5901234123457', 'code128')).toEqual({
      code: '5901234123457',
      format: 'code128',
    });
    expect(resolveDraftCode(' 5901234123457 ', 'qr')).toEqual({
      code: '5901234123457',
      format: 'qr',
    });
    // A bad-checksum EAN forced to EAN stays EAN (preview shows "Невалиден код").
    expect(resolveDraftCode('5901234123458', 'ean')).toEqual({
      code: '5901234123458',
      format: 'ean13',
    });
  });
});

describe('initialFormatChoice', () => {
  it('keeps auto-detection when the stored format matches detection', () => {
    expect(initialFormatChoice('5901234123457', 'ean13')).toBeNull();
    expect(initialFormatChoice('AB12', 'code128')).toBeNull();
  });

  it('pins the stored format when it differs from detection', () => {
    expect(initialFormatChoice('5901234123457', 'qr')).toBe('qr');
    expect(initialFormatChoice('5901234123457', 'code128')).toBe('code128');
  });
});

describe('detectCodeFormat', () => {
  it('detects a valid EAN-13', () => {
    expect(detectCodeFormat('5901234123457')).toEqual({ code: '5901234123457', format: 'ean13' });
  });

  it('strips spaces before detecting', () => {
    expect(detectCodeFormat(' 5 901234 123457 ')).toEqual({
      code: '5901234123457',
      format: 'ean13',
    });
  });

  it('promotes a valid 12-digit UPC-A to EAN-13 with a leading 0', () => {
    expect(detectCodeFormat('036000291452')).toEqual({ code: '0036000291452', format: 'ean13' });
  });

  it('detects a valid EAN-8', () => {
    expect(detectCodeFormat('96385074')).toEqual({ code: '96385074', format: 'ean8' });
  });

  it('treats 13 digits with a bad checksum as Code128', () => {
    expect(detectCodeFormat('5901234123458')).toEqual({
      code: '5901234123458',
      format: 'code128',
    });
  });

  it('treats 12 digits that are not valid UPC-A as Code128', () => {
    expect(detectCodeFormat('036000291453').format).toBe('code128');
  });

  it('treats 8 digits with a bad checksum as Code128', () => {
    expect(detectCodeFormat('96385075').format).toBe('code128');
  });

  it('treats other printable ASCII as Code128', () => {
    expect(detectCodeFormat('AB-1234/cd')).toEqual({ code: 'AB-1234/cd', format: 'code128' });
  });

  it('falls back to QR for non-ASCII content, keeping inner spaces', () => {
    expect(detectCodeFormat('  Карта № 12  ')).toEqual({ code: 'Карта № 12', format: 'qr' });
  });

  it('falls back to QR for long URL-like content with spaces kept', () => {
    expect(detectCodeFormat('https://example.com/é').format).toBe('qr');
  });
});

describe('normalizeCode', () => {
  it('keeps only digits for EAN formats', () => {
    expect(normalizeCode(' 5 901234-123457 ', 'ean13')).toBe('5901234123457');
    expect(normalizeCode('9638 5074', 'ean8')).toBe('96385074');
  });

  it('trims other formats without touching the inside', () => {
    expect(normalizeCode('  AB 12  ', 'code128')).toBe('AB 12');
    expect(normalizeCode('  hello world ', 'qr')).toBe('hello world');
  });
});

describe('displayCode', () => {
  it('groups EAN-13 as 1-6-6', () => {
    expect(displayCode('5901234123457', 'ean13')).toBe('5 901234 123457');
  });

  it('leaves a malformed EAN-13 value unchanged', () => {
    expect(displayCode('12345', 'ean13')).toBe('12345');
  });

  it('leaves other formats unchanged', () => {
    expect(displayCode('96385074', 'ean8')).toBe('96385074');
    expect(displayCode('AB1234', 'code128')).toBe('AB1234');
    expect(displayCode('x y', 'qr')).toBe('x y');
  });
});

describe('maskCode', () => {
  it('shows only the last four characters', () => {
    expect(maskCode('5901234123457')).toBe('•••• 3457');
  });

  it('does not mask very short codes', () => {
    expect(maskCode('1234')).toBe('1234');
    expect(maskCode('12')).toBe('12');
  });
});

describe('fromScannerResult', () => {
  it('maps ean13 / ean8 / code128 / qr directly', () => {
    expect(fromScannerResult('ean13', '5901234123457')).toEqual({
      code: '5901234123457',
      format: 'ean13',
    });
    expect(fromScannerResult('ean8', '96385074')).toEqual({ code: '96385074', format: 'ean8' });
    expect(fromScannerResult('code128', 'AB 12')).toEqual({ code: 'AB 12', format: 'code128' });
    expect(fromScannerResult('qr', ' Карта 1 ')).toEqual({ code: 'Карта 1', format: 'qr' });
  });

  it('converts UPC-A to EAN-13', () => {
    expect(fromScannerResult('upc_a', '036000291452')).toEqual({
      code: '0036000291452',
      format: 'ean13',
    });
  });

  it('falls back to detection when an EAN payload does not validate', () => {
    expect(fromScannerResult('ean13', '5901234123458')).toEqual({
      code: '5901234123458',
      format: 'code128',
    });
    expect(fromScannerResult('upc_a', '036000291453').format).toBe('code128');
  });

  it('falls back to detection for unknown symbologies', () => {
    expect(fromScannerResult('pdf417', '5901234123457')).toEqual({
      code: '5901234123457',
      format: 'ean13',
    });
    expect(fromScannerResult('datamatrix', 'Карта').format).toBe('qr');
  });
});

describe('formatGroup / formatForGroup', () => {
  it('collapses both EAN variants into one toggle group', () => {
    expect(formatGroup('ean13')).toBe('ean');
    expect(formatGroup('ean8')).toBe('ean');
    expect(formatGroup('code128')).toBe('code128');
    expect(formatGroup('qr')).toBe('qr');
  });

  it('picks EAN-8 for an 8-digit code and EAN-13 otherwise', () => {
    expect(formatForGroup('ean', '9638 5074')).toBe('ean8');
    expect(formatForGroup('ean', '5901234123457')).toBe('ean13');
    expect(formatForGroup('ean', '')).toBe('ean13');
    expect(formatForGroup('code128', '96385074')).toBe('code128');
    expect(formatForGroup('qr', 'x')).toBe('qr');
  });
});

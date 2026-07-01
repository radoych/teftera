import { TEFTERA_LOGO_DATA_URI } from './logo';

describe('TEFTERA_LOGO_DATA_URI', () => {
  it('is a png data uri', () => {
    expect(TEFTERA_LOGO_DATA_URI.startsWith('data:image/png;base64,')).toBe(true);
    expect(TEFTERA_LOGO_DATA_URI.length).toBeGreaterThan(1000);
  });
});

import { alias, vendor, withPrimaries } from './fixtures';
import { shouldLearnAlias } from './learn';
import { buildVendorIndex } from './resolve';

const kaufland = vendor('v1', 'Kaufland');
const index = buildVendorIndex(
  [kaufland],
  withPrimaries([kaufland], [alias('v1', 'KAUFLAND BULGARIA EOOD')]),
);

describe('shouldLearnAlias', () => {
  it('learns a new raw name that differs from the chosen vendor', () => {
    expect(shouldLearnAlias('KAUFLAND SF 12', 'Kaufland', index)).toBe(true);
  });

  it('skips a blank raw name', () => {
    expect(shouldLearnAlias('  ', 'Kaufland', index)).toBe(false);
  });

  it('skips when the raw name is just the final name (case / spacing)', () => {
    expect(shouldLearnAlias('  KAUFLAND ', 'Kaufland', index)).toBe(false);
  });

  it('skips a raw name that is already recognized', () => {
    expect(shouldLearnAlias('kaufland bulgaria  eood', 'Kaufland', index)).toBe(false);
  });
});

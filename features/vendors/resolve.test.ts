import { alias, vendor, withPrimaries } from './fixtures';
import {
  buildVendorIndex,
  filterVendors,
  resolveVendor,
  suggestVendors,
  vendorDefaultCategoryId,
} from './resolve';

const kaufland = vendor('v1', 'Kaufland');
const billa = vendor('v2', 'Billa');
const lidl = vendor('v3', 'Lidl');
const fantastico = vendor('v4', 'Fantastico Market');

const kauflandCyr = alias('v1', 'Кауфланд', { source: 'receipt' });
const kauflandEood = alias('v1', 'KAUFLAND BULGARIA EOOD');
const billaStara = alias('v2', 'kaufland stara');

const index = buildVendorIndex(
  [kaufland, billa, lidl, fantastico],
  withPrimaries([kaufland, billa, lidl, fantastico], [kauflandCyr, kauflandEood, billaStara]),
);

describe('buildVendorIndex', () => {
  it('indexes vendors by id and every alias (incl. primary) by key', () => {
    expect(index.byId.get('v1')).toBe(kaufland);
    expect(index.byKey.get('kaufland')?.vendor).toBe(kaufland);
    expect(index.byKey.get('kaufland')?.alias.is_primary).toBe(true);
    expect(index.byKey.get('кауфланд')?.alias).toBe(kauflandCyr);
  });

  it('lists non-primary aliases per vendor, alias ascending (bg collation: Cyrillic first)', () => {
    expect(index.aliasesByVendor.get('v1')?.map((a) => a.alias)).toEqual([
      'Кауфланд',
      'KAUFLAND BULGARIA EOOD',
    ]);
    expect(index.aliasesByVendor.get('v3')).toBeUndefined();
  });

  it('ignores aliases whose vendor is missing', () => {
    const idx = buildVendorIndex([lidl], [alias('ghost', 'Ghost Shop')]);
    expect(idx.byKey.has('ghost shop')).toBe(false);
    expect(idx.aliasesByVendor.has('ghost')).toBe(false);
  });
});

describe('resolveVendor', () => {
  it('matches on the vendor name', () => {
    expect(resolveVendor('Lidl', index)).toBe(lidl);
  });

  it('matches on an alias', () => {
    expect(resolveVendor('KAUFLAND BULGARIA EOOD', index)).toBe(kaufland);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(resolveVendor('  kaufland   bulgaria eood ', index)).toBe(kaufland);
    expect(resolveVendor('LIDL', index)).toBe(lidl);
  });

  it('returns null for unknown or blank input', () => {
    expect(resolveVendor('Metro', index)).toBeNull();
    expect(resolveVendor('   ', index)).toBeNull();
  });
});

describe('suggestVendors', () => {
  it('returns nothing for a blank query', () => {
    expect(suggestVendors('  ', index)).toEqual([]);
  });

  it('ranks a name prefix above an alias prefix', () => {
    const result = suggestVendors('ka', index);
    expect(result.map((s) => [s.vendor.name, s.score])).toEqual([
      ['Kaufland', 0],
      ['Billa', 3],
    ]);
    expect(result[0]?.matchedAlias).toBeNull();
    expect(result[1]?.matchedAlias).toBe(billaStara);
  });

  it('matches a word of the name', () => {
    expect(suggestVendors('mark', index).map((s) => [s.vendor.name, s.score])).toEqual([
      ['Fantastico Market', 1],
    ]);
  });

  it('matches a substring of the name', () => {
    const result = suggestVendors('land', index);
    expect(result[0]?.vendor).toBe(kaufland);
    expect(result[0]?.score).toBe(2);
  });

  it('matches a Cyrillic alias and reports it', () => {
    const [first] = suggestVendors('кауф', index);
    expect(first?.vendor).toBe(kaufland);
    expect(first?.matchedAlias).toBe(kauflandCyr);
    expect(first?.score).toBe(3);
  });

  it('scores alias word-prefix (4) and alias substring (5)', () => {
    expect(suggestVendors('stara', index).map((s) => s.score)).toEqual([4]);
    expect(suggestVendors('tara', index).map((s) => s.score)).toEqual([5]);
  });

  it('keeps one entry per vendor at its best score', () => {
    // 'kauf' prefixes Kaufland's name (0) and its EOOD alias (3).
    const result = suggestVendors('kauf', index);
    expect(result.filter((s) => s.vendor.id === 'v1')).toHaveLength(1);
    expect(result[0]?.score).toBe(0);
  });

  it('breaks ties alphabetically (bg collation)', () => {
    const vs = [vendor('x', 'Zeta'), vendor('y', 'Alpha'), vendor('z', 'Mira')];
    const idx = buildVendorIndex(vs, withPrimaries(vs));
    expect(suggestVendors('a', idx).map((s) => s.vendor.name)).toEqual(['Alpha', 'Mira', 'Zeta']);
  });

  it('respects the limit', () => {
    const many = Array.from({ length: 10 }, (_, i) => vendor(`m${i}`, `Shop ${i}`));
    const idx = buildVendorIndex(many, withPrimaries(many));
    expect(suggestVendors('shop', idx)).toHaveLength(6);
    expect(suggestVendors('shop', idx, 3)).toHaveLength(3);
  });

  it('yields nothing once the input exactly holds a vendor name', () => {
    expect(suggestVendors('Kaufland', index)).toEqual([]);
    expect(suggestVendors('Kaufland ', index)).toEqual([]);
  });

  it('can exclude one vendor (the one being edited)', () => {
    expect(suggestVendors('ka', index, 6, 'v1').map((s) => s.vendor.name)).toEqual(['Billa']);
  });
});

describe('filterVendors', () => {
  it('lists every vendor alphabetically for a blank query', () => {
    expect(filterVendors(' ', index).map((v) => v.name)).toEqual([
      'Billa',
      'Fantastico Market',
      'Kaufland',
      'Lidl',
    ]);
  });

  it('matches a substring of the name or of any recognized name', () => {
    expect(filterVendors('LAND', index).map((v) => v.name)).toEqual(['Billa', 'Kaufland']);
    expect(filterVendors('кауф', index).map((v) => v.name)).toEqual(['Kaufland']);
    expect(filterVendors('metro', index)).toEqual([]);
  });
});

describe('vendorDefaultCategoryId', () => {
  const withDefault = vendor('d1', 'Lidl', 'cat-food');
  const noDefault = vendor('d2', 'Billa');
  const idx = buildVendorIndex(
    [withDefault, noDefault],
    withPrimaries([withDefault, noDefault], [alias('d1', 'LIDL BULGARIA EOOD')]),
  );

  it("returns the vendor's default via its name or any recognized name", () => {
    expect(vendorDefaultCategoryId('lidl', idx)).toBe('cat-food');
    expect(vendorDefaultCategoryId('  Lidl  Bulgaria eood ', idx)).toBe('cat-food');
  });

  it('is null for a vendor without a default or an unknown merchant', () => {
    expect(vendorDefaultCategoryId('Billa', idx)).toBeNull();
    expect(vendorDefaultCategoryId('Kaufland', idx)).toBeNull();
    expect(vendorDefaultCategoryId('', idx)).toBeNull();
  });
});

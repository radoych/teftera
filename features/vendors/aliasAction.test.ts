import { aliasAction, pickAliasTarget } from './aliasAction';
import { alias, vendor, withPrimaries } from './fixtures';
import { buildVendorIndex } from './resolve';

const kaufland = vendor('v1', 'Kaufland');
const lidl = vendor('v2', 'Lidl');
const stara = alias('v1', 'KAUFLAND STARA ZAGORA', { id: 'al-1' });
const index = buildVendorIndex(
  [kaufland, lidl],
  withPrimaries([kaufland, lidl], [stara]),
);

describe('pickAliasTarget', () => {
  it('is none for blank text', () => {
    expect(pickAliasTarget('  ', null, index)).toEqual({ kind: 'none' });
  });

  it('uses the picked suggestion while the text still holds its name', () => {
    expect(pickAliasTarget('lidl ', lidl, index)).toEqual({
      kind: 'existing',
      vendor: lidl,
    });
  });

  it('ignores a stale pick once the text changed, resolving the text instead', () => {
    expect(pickAliasTarget('Kaufland', lidl, index)).toEqual({
      kind: 'existing',
      vendor: kaufland,
    });
  });

  it('resolves typed recognized names to their vendor', () => {
    expect(pickAliasTarget('kaufland stara zagora', null, index)).toEqual({
      kind: 'existing',
      vendor: kaufland,
    });
  });

  it('treats unknown text as a new vendor name (cleaned)', () => {
    expect(pickAliasTarget('  Billa   Plovdiv ', null, index)).toEqual({
      kind: 'new',
      name: 'Billa Plovdiv',
    });
  });

  it('flags the excluded vendor as self', () => {
    expect(pickAliasTarget('Lidl', lidl, index, 'v2')).toEqual({
      kind: 'self',
      vendor: lidl,
    });
    expect(pickAliasTarget('Kaufland', null, index, 'v2')).toEqual({
      kind: 'existing',
      vendor: kaufland,
    });
  });

  it('drops a picked vendor that is gone from the index', () => {
    const gone = vendor('v9', 'Fantastico');
    expect(pickAliasTarget('Fantastico', gone, index)).toEqual({
      kind: 'new',
      name: 'Fantastico',
    });
  });
});

describe('aliasAction', () => {
  it('is invalid for a blank merchant', () => {
    expect(aliasAction(' ', lidl, index)).toEqual({ kind: 'invalid' });
  });

  it('is already when the merchant is the target name or one of its recognized names', () => {
    expect(aliasAction('LIDL', lidl, index)).toEqual({ kind: 'already', vendor: lidl });
    expect(aliasAction('Kaufland Stara Zagora', kaufland, index)).toEqual({
      kind: 'already',
      vendor: kaufland,
    });
  });

  it('adds an unknown merchant (cleaned)', () => {
    expect(aliasAction(' LIDL  SOFIA ', lidl, index)).toEqual({
      kind: 'add',
      alias: 'LIDL SOFIA',
    });
  });

  it('reports a movable conflict when another vendor holds it as a recognized name', () => {
    const action = aliasAction('kaufland stara zagora', lidl, index);
    expect(action.kind).toBe('conflict');
    if (action.kind !== 'conflict') return;
    expect(action.conflict.owner).toBe(kaufland);
    expect(action.conflict.ownerAlias.id).toBe('al-1');
    expect(action.conflict.ownerAlias.is_primary).toBe(false);
  });

  it("reports a merge conflict when the merchant is another vendor's own name", () => {
    const action = aliasAction('KAUFLAND', lidl, index);
    expect(action.kind).toBe('conflict');
    if (action.kind !== 'conflict') return;
    expect(action.conflict.owner).toBe(kaufland);
    expect(action.conflict.ownerAlias.is_primary).toBe(true);
  });

  it('treats the target own name as already even before its primary row loads', () => {
    const fresh = vendor('v3', 'Billa');
    const partial = buildVendorIndex([kaufland, lidl], withPrimaries([kaufland, lidl]));
    expect(aliasAction('billa', fresh, partial)).toEqual({
      kind: 'already',
      vendor: fresh,
    });
  });
});

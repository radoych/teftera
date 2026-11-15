import {
  conflictFromError,
  describeConflict,
  isUniqueViolation,
  parseUniqueViolation,
} from './conflict';
import { alias, vendor, withPrimaries } from './fixtures';
import { buildVendorIndex } from './resolve';

const fixture = {
  code: '23505',
  details:
    'Key (household_id, alias_key)=(5f8a7c1e-1111-4b2c-9d3e-2a6b7c8d9e0f, kaufland) already exists.',
  message:
    'duplicate key value violates unique constraint "vendor_aliases_household_id_alias_key_key"',
};

describe('parseUniqueViolation', () => {
  it('extracts the constraint name and the last key value', () => {
    expect(parseUniqueViolation(fixture)).toEqual({
      constraint: 'vendor_aliases_household_id_alias_key_key',
      aliasKey: 'kaufland',
    });
  });

  it('keeps commas inside the last value', () => {
    expect(
      parseUniqueViolation({
        ...fixture,
        details: 'Key (household_id, alias_key)=(abc, kaufland, sofia) already exists.',
      })?.aliasKey,
    ).toBe('kaufland, sofia');
  });

  it('returns null for any other error', () => {
    expect(parseUniqueViolation({ code: '23514', message: 'check violation' })).toBeNull();
    expect(parseUniqueViolation(new Error('offline'))).toBeNull();
    expect(parseUniqueViolation(null)).toBeNull();
    expect(parseUniqueViolation('23505')).toBeNull();
  });

  it('tolerates malformed details / message', () => {
    expect(parseUniqueViolation({ code: '23505', details: 'garbage', message: 'nope' })).toEqual({
      constraint: null,
      aliasKey: null,
    });
    expect(parseUniqueViolation({ code: '23505' })).toEqual({ constraint: null, aliasKey: null });
  });
});

describe('isUniqueViolation', () => {
  it('is true only for 23505', () => {
    expect(isUniqueViolation(fixture)).toBe(true);
    expect(isUniqueViolation(new Error('x'))).toBe(false);
  });
});

describe('describeConflict', () => {
  const kaufland = vendor('v1', 'Kaufland');
  const stara = alias('v1', 'Kaufland Stara');
  const index = buildVendorIndex([kaufland], withPrimaries([kaufland], [stara]));

  it('names the vendor and the row that hold the key', () => {
    expect(describeConflict('KAUFLAND stara', 'kaufland stara', index)).toEqual({
      attemptedAlias: 'KAUFLAND stara',
      aliasKey: 'kaufland stara',
      owner: kaufland,
      ownerAlias: stara,
    });
  });

  it('returns null when the key is not (yet) known locally', () => {
    expect(describeConflict('Metro', 'metro', index)).toBeNull();
  });
});

describe('conflictFromError', () => {
  const kaufland = vendor('v1', 'Kaufland');
  const index = buildVendorIndex([kaufland], withPrimaries([kaufland]));

  it('describes the owner of the key in a 23505', () => {
    expect(conflictFromError(fixture, 'KAUFLAND', index)?.owner).toBe(kaufland);
  });

  it('falls back to the locally computed key when details are malformed', () => {
    expect(conflictFromError({ code: '23505' }, ' Kaufland ', index)?.aliasKey).toBe('kaufland');
  });

  it('is null for other errors and unknown keys', () => {
    expect(conflictFromError(new Error('x'), 'Kaufland', index)).toBeNull();
    expect(conflictFromError({ code: '23505' }, 'Metro', index)).toBeNull();
  });
});

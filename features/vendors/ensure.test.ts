import { ensureVendorForMerchant, type EnsureVendorDeps } from './ensure';
import { alias, vendor, withPrimaries } from './fixtures';
import { buildVendorIndex } from './resolve';

const kaufland = vendor('v1', 'Kaufland');
const index = buildVendorIndex(
  [kaufland],
  withPrimaries([kaufland], [alias('v1', 'KAUFLAND BULGARIA EOOD')]),
);
const empty = buildVendorIndex([], []);
const dup = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "vendors_household_id_name_key_key"',
  details: 'Key (household_id, name_key)=(h1, metro) already exists.',
};

function makeDeps(overrides: Partial<EnsureVendorDeps> = {}): EnsureVendorDeps {
  return {
    createVendor: jest.fn(async () => ({ id: 'new-id' })),
    refreshVendors: jest.fn(async () => {}),
    getIndex: jest.fn(() => empty),
    ...overrides,
  };
}

describe('ensureVendorForMerchant', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('returns the existing vendor without writing when the merchant resolves', async () => {
    const deps = makeDeps();
    await expect(
      ensureVendorForMerchant({ householdId: 'h1', merchant: 'kaufland bulgaria eood', index }, deps),
    ).resolves.toEqual({ name: 'Kaufland', vendorId: 'v1', created: false });
    expect(deps.createVendor).not.toHaveBeenCalled();
  });

  it('creates a vendor for an unknown merchant (trimmed, whitespace collapsed)', async () => {
    const deps = makeDeps();
    await expect(
      ensureVendorForMerchant({ householdId: 'h1', merchant: '  Metro   Cash ', index }, deps),
    ).resolves.toEqual({ name: 'Metro Cash', vendorId: 'new-id', created: true });
    expect(deps.createVendor).toHaveBeenCalledWith({ householdId: 'h1', name: 'Metro Cash' });
  });

  it('on a unique race refreshes and resolves against the fresh index', async () => {
    const metro = vendor('v9', 'Metro');
    const fresh = buildVendorIndex([metro], withPrimaries([metro]));
    const deps = makeDeps({
      createVendor: jest.fn(async () => {
        throw dup;
      }),
      getIndex: jest.fn(() => fresh),
    });
    await expect(
      ensureVendorForMerchant({ householdId: 'h1', merchant: 'METRO', index }, deps),
    ).resolves.toEqual({ name: 'Metro', vendorId: 'v9', created: false });
    expect(deps.refreshVendors).toHaveBeenCalledWith('h1');
  });

  it('falls back to the typed name when the race still does not resolve', async () => {
    const deps = makeDeps({
      createVendor: jest.fn(async () => {
        throw dup;
      }),
    });
    await expect(
      ensureVendorForMerchant({ householdId: 'h1', merchant: ' Metro ', index }, deps),
    ).resolves.toEqual({ name: 'Metro', vendorId: '', created: false });
  });

  it('never throws: any other error falls back without a refresh', async () => {
    const deps = makeDeps({
      createVendor: jest.fn(async () => {
        throw new Error('offline');
      }),
    });
    await expect(
      ensureVendorForMerchant({ householdId: 'h1', merchant: 'Metro', index }, deps),
    ).resolves.toEqual({ name: 'Metro', vendorId: '', created: false });
    expect(deps.refreshVendors).not.toHaveBeenCalled();
  });

  it('never throws: a failed refresh after a race falls back', async () => {
    const deps = makeDeps({
      createVendor: jest.fn(async () => {
        throw dup;
      }),
      refreshVendors: jest.fn(async () => {
        throw new Error('offline');
      }),
    });
    await expect(
      ensureVendorForMerchant({ householdId: 'h1', merchant: 'Metro', index }, deps),
    ).resolves.toEqual({ name: 'Metro', vendorId: '', created: false });
  });

  it('does nothing for a blank merchant', async () => {
    const deps = makeDeps();
    await expect(
      ensureVendorForMerchant({ householdId: 'h1', merchant: '  ', index }, deps),
    ).resolves.toEqual({ name: '', vendorId: '', created: false });
    expect(deps.createVendor).not.toHaveBeenCalled();
  });
});

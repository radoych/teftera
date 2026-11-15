import { recordVendorAfterSave, type RecordVendorDeps } from './afterSave';
import { alias, vendor, withPrimaries } from './fixtures';
import { buildVendorIndex } from './resolve';

const kaufland = vendor('v1', 'Kaufland');
const index = buildVendorIndex(
  [kaufland],
  withPrimaries([kaufland], [alias('v1', 'KAUFLAND BULGARIA EOOD')]),
);

function makeDeps(overrides: Partial<RecordVendorDeps> = {}): RecordVendorDeps {
  return {
    getIndex: jest.fn(() => index),
    ensure: jest.fn(async () => ({ name: 'Kaufland', vendorId: 'v1', created: false })),
    addAlias: jest.fn(async () => {}),
    refreshVendors: jest.fn(async () => {}),
    ...overrides,
  };
}

describe('recordVendorAfterSave', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('ensures the vendor for the saved merchant against the current index', async () => {
    const deps = makeDeps();
    await recordVendorAfterSave({ householdId: 'h1', merchant: 'Kaufland' }, deps);
    expect(deps.ensure).toHaveBeenCalledWith({ householdId: 'h1', merchant: 'Kaufland', index });
    expect(deps.addAlias).not.toHaveBeenCalled();
  });

  it('learns the raw extracted merchant as a receipt alias of the chosen vendor', async () => {
    const deps = makeDeps();
    await recordVendorAfterSave(
      { householdId: 'h1', merchant: 'Kaufland', extractedMerchant: 'KAUFLAND SF 12' },
      deps,
    );
    expect(deps.addAlias).toHaveBeenCalledWith({
      householdId: 'h1',
      vendorId: 'v1',
      alias: 'KAUFLAND SF 12',
      source: 'receipt',
    });
    expect(deps.refreshVendors).toHaveBeenCalledWith('h1');
  });

  it('does not learn a name that is already recognized or equals the vendor', async () => {
    const deps = makeDeps();
    await recordVendorAfterSave(
      { householdId: 'h1', merchant: 'Kaufland', extractedMerchant: 'kaufland bulgaria eood' },
      deps,
    );
    await recordVendorAfterSave(
      { householdId: 'h1', merchant: 'Kaufland', extractedMerchant: 'KAUFLAND' },
      deps,
    );
    expect(deps.addAlias).not.toHaveBeenCalled();
  });

  it('does not learn when ensure fell back (no vendor id)', async () => {
    const deps = makeDeps({
      ensure: jest.fn(async () => ({ name: 'Kaufland', vendorId: '', created: false })),
    });
    await recordVendorAfterSave(
      { householdId: 'h1', merchant: 'Kaufland', extractedMerchant: 'KAUFLAND SF 12' },
      deps,
    );
    expect(deps.addAlias).not.toHaveBeenCalled();
  });

  it('refreshes after creating a vendor so autocomplete sees it', async () => {
    const deps = makeDeps({
      ensure: jest.fn(async () => ({ name: 'Metro', vendorId: 'v2', created: true })),
    });
    await recordVendorAfterSave({ householdId: 'h1', merchant: 'Metro' }, deps);
    expect(deps.refreshVendors).toHaveBeenCalledTimes(1);
  });

  it('silently skips a learning conflict (other phone learned it first) and never throws', async () => {
    const deps = makeDeps({
      addAlias: jest.fn(async () => {
        throw { code: '23505', message: 'duplicate key' };
      }),
    });
    await expect(
      recordVendorAfterSave(
        { householdId: 'h1', merchant: 'Kaufland', extractedMerchant: 'KAUFLAND SF 12' },
        deps,
      ),
    ).resolves.toBeUndefined();
  });
});

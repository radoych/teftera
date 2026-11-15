import type { EnsuredVendor } from '@/features/vendors/ensure';
import { alias, vendor, withPrimaries } from '@/features/vendors/fixtures';
import { buildVendorIndex } from '@/features/vendors/resolve';
import {
  initialVendorText,
  resolveCardVendorId,
  type CardVendorDeps,
} from './vendorField';

const kaufland = vendor('v1', 'Kaufland');
const index = buildVendorIndex([kaufland], withPrimaries([kaufland], [alias('v1', 'Кауфланд')]));

function makeDeps(result: EnsuredVendor = { name: 'Kaufland', vendorId: 'v1', created: false }) {
  const deps: CardVendorDeps = {
    ensure: jest.fn(async () => result),
    refreshVendors: jest.fn(async () => {}),
  };
  return deps;
}

const base = { householdId: 'h1', initialText: '', initialVendorId: null, index };

describe('initialVendorText', () => {
  it('is the vendor name for a known vendor', () => {
    expect(initialVendorText('v1', index)).toBe('Kaufland');
  });
  it('is empty for no vendor or an unknown one', () => {
    expect(initialVendorText(null, index)).toBe('');
    expect(initialVendorText('v9', index)).toBe('');
  });
});

describe('resolveCardVendorId', () => {
  it('blank field → orphan card, no writes', async () => {
    const deps = makeDeps();
    await expect(resolveCardVendorId({ ...base, text: '   ' }, deps)).resolves.toBeNull();
    expect(deps.ensure).not.toHaveBeenCalled();
  });

  it('untouched field keeps the original vendor id, even when its name is not loaded', async () => {
    const deps = makeDeps();
    await expect(
      resolveCardVendorId({ ...base, text: '', initialText: '', initialVendorId: 'v9' }, deps),
    ).resolves.toBe('v9');
    await expect(
      resolveCardVendorId(
        { ...base, text: ' Kaufland ', initialText: 'Kaufland', initialVendorId: 'v1' },
        deps,
      ),
    ).resolves.toBe('v1');
    expect(deps.ensure).not.toHaveBeenCalled();
  });

  it('clearing a pre-filled vendor detaches the card', async () => {
    const deps = makeDeps();
    await expect(
      resolveCardVendorId({ ...base, text: '', initialText: 'Kaufland', initialVendorId: 'v1' }, deps),
    ).resolves.toBeNull();
  });

  it('a typed existing name / recognized name resolves through ensure without a refresh', async () => {
    const deps = makeDeps();
    await expect(resolveCardVendorId({ ...base, text: 'кауфланд' }, deps)).resolves.toBe('v1');
    expect(deps.ensure).toHaveBeenCalledWith({ householdId: 'h1', merchant: 'кауфланд', index });
    expect(deps.refreshVendors).not.toHaveBeenCalled();
  });

  it('a brand-new name creates the vendor and refreshes the vendors store', async () => {
    const deps = makeDeps({ name: 'Metro', vendorId: 'v2', created: true });
    await expect(resolveCardVendorId({ ...base, text: 'Metro' }, deps)).resolves.toBe('v2');
    expect(deps.refreshVendors).toHaveBeenCalledWith('h1');
  });

  it('a failed refresh after create still saves the card with the new vendor', async () => {
    const deps = makeDeps({ name: 'Metro', vendorId: 'v2', created: true });
    deps.refreshVendors = jest.fn(async () => {
      throw new Error('offline');
    });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(resolveCardVendorId({ ...base, text: 'Metro' }, deps)).resolves.toBe('v2');
    jest.restoreAllMocks();
  });

  it('rejects (aborting the save) when no vendor could be resolved or created', async () => {
    const deps = makeDeps({ name: 'Metro', vendorId: '', created: false });
    await expect(resolveCardVendorId({ ...base, text: 'Metro' }, deps)).rejects.toThrow();
  });
});

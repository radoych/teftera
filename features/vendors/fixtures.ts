// features/vendors/fixtures.ts — test builders shared by the vendors unit tests.
import { merchantKey } from './key';
import type { AliasSource, Vendor, VendorAlias } from './types';

export function vendor(id: string, name: string, defaultCategoryId: string | null = null): Vendor {
  return {
    id,
    household_id: 'h1',
    name,
    name_key: merchantKey(name),
    default_category_id: defaultCategoryId,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
  };
}

let seq = 0;
export function alias(
  vendorId: string,
  text: string,
  opts: { primary?: boolean; source?: AliasSource; id?: string } = {},
): VendorAlias {
  seq += 1;
  return {
    id: opts.id ?? `a${seq}`,
    household_id: 'h1',
    vendor_id: vendorId,
    alias: text,
    alias_key: merchantKey(text),
    is_primary: opts.primary ?? false,
    source: opts.source ?? 'manual',
    created_at: '2026-11-01T00:00:00Z',
  };
}

/** Vendors plus their primary alias rows, as the DB trigger would create them. */
export function withPrimaries(vendors: Vendor[], extra: VendorAlias[] = []): VendorAlias[] {
  return [...vendors.map((v) => alias(v.id, v.name, { primary: true, id: `p-${v.id}` })), ...extra];
}

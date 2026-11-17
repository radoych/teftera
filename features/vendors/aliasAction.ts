// features/vendors/aliasAction.ts — "make this name a recognized name of …" decisions (pure).
import { describeConflict } from './conflict';
import { cleanVendorName, merchantKey } from './key';
import { resolveVendor } from './resolve';
import type { AliasConflict, Vendor, VendorIndex } from './types';

/** What the vendor field of a "pick a vendor" sheet currently points at. */
export type AliasTarget =
  | { kind: 'none' }
  /** The excluded vendor (the one being edited) — not a valid target. */
  | { kind: 'self'; vendor: Vendor }
  | { kind: 'existing'; vendor: Vendor }
  /** Typed text that matches no vendor or recognized name. */
  | { kind: 'new'; name: string };

/**
 * Resolve the sheet's vendor field. A picked suggestion wins while the text
 * still holds its name; otherwise typed text resolves like any merchant (a
 * vendor name or one of its recognized names), else it is a new vendor name.
 */
export function pickAliasTarget(
  text: string,
  selected: Vendor | null,
  index: VendorIndex,
  excludeVendorId?: string,
): AliasTarget {
  const name = cleanVendorName(text);
  if (!name) return { kind: 'none' };
  const picked =
    selected && merchantKey(selected.name) === merchantKey(name)
      ? (index.byId.get(selected.id) ?? null)
      : null;
  const vendor = picked ?? resolveVendor(name, index);
  if (!vendor) return { kind: 'new', name };
  return vendor.id === excludeVendorId
    ? { kind: 'self', vendor }
    : { kind: 'existing', vendor };
}

/** What adding `merchant` as a recognized name of `target` takes. */
export type AliasAction =
  | { kind: 'invalid' }
  /** `merchant` already resolves to `target` — nothing to do. */
  | { kind: 'already'; vendor: Vendor }
  /** Nobody holds the key — insert the alias. */
  | { kind: 'add'; alias: string }
  /**
   * Another vendor holds the key: as a recognized name (`ownerAlias.is_primary`
   * false → it can be moved) or as its own name (→ merge that vendor into the
   * target). Both go through the conflict sheet.
   */
  | { kind: 'conflict'; conflict: AliasConflict };

export function aliasAction(
  merchant: string,
  target: Vendor,
  index: VendorIndex,
): AliasAction {
  const alias = cleanVendorName(merchant);
  const key = merchantKey(alias);
  if (!key) return { kind: 'invalid' };
  if (target.name_key === key) return { kind: 'already', vendor: target };
  const hit = index.byKey.get(key);
  if (!hit) return { kind: 'add', alias };
  if (hit.vendor.id === target.id) return { kind: 'already', vendor: target };
  const conflict = describeConflict(alias, key, index);
  return conflict ? { kind: 'conflict', conflict } : { kind: 'add', alias };
}

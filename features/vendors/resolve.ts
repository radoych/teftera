// features/vendors/resolve.ts — in-memory vendor lookup + autocomplete ranking (pure).
import { merchantKey } from './key';
import type { Vendor, VendorAlias, VendorIndex, VendorSuggestion } from './types';

const byAlias = (a: VendorAlias, b: VendorAlias) => a.alias.localeCompare(b.alias, 'bg');

/** Build the lookup structures. Aliases whose vendor is missing are ignored. */
export function buildVendorIndex(vendors: Vendor[], aliases: VendorAlias[]): VendorIndex {
  const byId = new Map(vendors.map((v) => [v.id, v] as const));
  const byKey: VendorIndex['byKey'] = new Map();
  const aliasesByVendor: VendorIndex['aliasesByVendor'] = new Map();

  for (const alias of aliases) {
    const vendor = byId.get(alias.vendor_id);
    if (!vendor) continue;
    byKey.set(alias.alias_key, { vendor, alias });
    if (alias.is_primary) continue;
    const list = aliasesByVendor.get(vendor.id);
    if (list) list.push(alias);
    else aliasesByVendor.set(vendor.id, [alias]);
  }
  // Belt and braces: a vendor's own name always resolves, even if its primary
  // alias row has not arrived yet (the two tables load independently).
  for (const vendor of vendors) {
    if (byKey.has(vendor.name_key)) continue;
    byKey.set(vendor.name_key, {
      vendor,
      alias: {
        id: `primary:${vendor.id}`,
        household_id: vendor.household_id,
        vendor_id: vendor.id,
        alias: vendor.name,
        alias_key: vendor.name_key,
        is_primary: true,
        source: 'manual',
        created_at: vendor.created_at,
      },
    });
  }
  for (const list of aliasesByVendor.values()) list.sort(byAlias);

  return { byId, byKey, aliasesByVendor };
}

/** Exact key match on a vendor name or any recognized name; `null` otherwise. */
export function resolveVendor(raw: string, index: VendorIndex): Vendor | null {
  const key = merchantKey(raw);
  if (!key) return null;
  return index.byKey.get(key)?.vendor ?? null;
}

/**
 * Rank a key against a text: 0 = text starts with it, 1 = a word of the text
 * starts with it, 2 = text contains it, `null` = no match.
 */
function matchRank(textKey: string, query: string): 0 | 1 | 2 | null {
  if (textKey.startsWith(query)) return 0;
  const at = textKey.indexOf(query);
  if (at < 0) return null;
  // A word boundary anywhere before the first hit, or a later hit on one.
  for (let i = at; i >= 0; i = textKey.indexOf(query, i + 1)) {
    if (i > 0 && textKey[i - 1] === ' ') return 1;
  }
  return 2;
}

/**
 * Autocomplete suggestions for a partially typed merchant (prefix / word /
 * substring on names, then on recognized names — no fuzzy matching).
 * Lower score is better: name 0/1/2, alias 3/4/5. One entry per vendor at its
 * best score; ties break alphabetically (bg collation). Nothing is suggested
 * once the query exactly holds a vendor's name.
 */
export function suggestVendors(
  query: string,
  index: VendorIndex,
  limit = 6,
  excludeVendorId?: string,
): VendorSuggestion[] {
  const q = merchantKey(query);
  if (!q) return [];
  const exact = index.byKey.get(q);
  if (exact?.alias.is_primary && exact.vendor.id !== excludeVendorId) return [];

  const best = new Map<string, VendorSuggestion>();
  const offer = (s: VendorSuggestion) => {
    const prev = best.get(s.vendor.id);
    if (!prev || s.score < prev.score) best.set(s.vendor.id, s);
  };

  for (const vendor of index.byId.values()) {
    if (vendor.id === excludeVendorId) continue;
    const rank = matchRank(vendor.name_key, q);
    if (rank !== null) offer({ vendor, matchedAlias: null, score: rank });
  }
  for (const { vendor, alias } of index.byKey.values()) {
    if (alias.is_primary || vendor.id === excludeVendorId) continue;
    const rank = matchRank(alias.alias_key, q);
    if (rank !== null) offer({ vendor, matchedAlias: alias, score: 3 + rank });
  }

  return [...best.values()]
    .sort((a, b) => a.score - b.score || a.vendor.name.localeCompare(b.vendor.name, 'bg'))
    .slice(0, limit);
}

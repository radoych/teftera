// features/vendors/key.ts — the merchant normalization key (pure; no Expo imports).

/**
 * TS mirror of `private.merchant_key` (migration 20261115130000_vendors.sql):
 * NFKC → lowercase → collapse whitespace → trim. The DB trigger is the
 * authority (it feeds the unique index); this copy only serves local lookups,
 * so the two must agree on every realistic input.
 */
export function merchantKey(raw: string): string {
  return raw.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Display form the DB stores for a name/alias: trimmed, inner whitespace collapsed. */
export function cleanVendorName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

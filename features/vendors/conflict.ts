// features/vendors/conflict.ts — Postgres unique-violation parsing (pure).
import { merchantKey } from './key';
import type { AliasConflict, VendorIndex } from './types';

export interface UniqueViolation {
  /** e.g. `vendor_aliases_household_id_alias_key_key`; null when unparseable. */
  constraint: string | null;
  /** The last value of the violating key tuple — the alias / name key. */
  aliasKey: string | null;
}

function field(err: object, name: 'code' | 'message' | 'details'): string | null {
  const value = (err as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : null;
}

/** True for a Postgres `23505` (unique_violation) as Supabase surfaces it. */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && field(err, 'code') === '23505';
}

/**
 * Decode a Supabase/PostgREST `23505`:
 * `{ code, message: 'duplicate key … constraint "<name>"', details: 'Key (a, b)=(x, y) already exists.' }`.
 * Returns null for any other error. The key tuple's first value is always the
 * household uuid (no commas), so everything after its first comma is the key —
 * which keeps commas that are part of the alias itself.
 */
export function parseUniqueViolation(err: unknown): UniqueViolation | null {
  if (!isUniqueViolation(err) || typeof err !== 'object' || err === null) return null;
  const constraint = /constraint "([^"]+)"/.exec(field(err, 'message') ?? '')?.[1] ?? null;
  const tuple = /\)=\((.*)\) already exists/.exec(field(err, 'details') ?? '')?.[1];
  let aliasKey: string | null = null;
  if (tuple !== undefined) {
    const comma = tuple.indexOf(', ');
    aliasKey = comma >= 0 ? tuple.slice(comma + 2) : tuple;
  }
  return { constraint, aliasKey };
}

/** Look up who already holds `aliasKey`. Null when the local index does not know yet. */
export function describeConflict(
  attemptedAlias: string,
  aliasKey: string,
  index: VendorIndex,
): AliasConflict | null {
  const hit = index.byKey.get(aliasKey);
  if (!hit) return null;
  return { attemptedAlias, aliasKey, owner: hit.vendor, ownerAlias: hit.alias };
}

/**
 * The conflict behind a failed write of `attempted` (a name or recognized
 * name): null unless `err` is a `23505` whose key the index knows. Uses the
 * key from the error, falling back to the locally computed key.
 */
export function conflictFromError(
  err: unknown,
  attempted: string,
  index: VendorIndex,
): AliasConflict | null {
  const parsed = parseUniqueViolation(err);
  if (!parsed) return null;
  const key = parsed.aliasKey ?? merchantKey(attempted);
  return (
    describeConflict(attempted, key, index) ??
    describeConflict(attempted, merchantKey(attempted), index)
  );
}

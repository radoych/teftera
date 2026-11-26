// features/vendors/api.ts — the ONLY module that reads/writes vendors / vendor_aliases.
import { supabase } from '@/services/supabase';
import { merchantKey } from './key';
import type { AliasSource, Vendor, VendorAlias } from './types';

// Explicit column lists — never select('*'). Single literals so postgrest-js
// can type the selected row.
const VENDOR_COLUMNS =
  'id, household_id, name, name_key, default_category_id, created_at, updated_at' as const;
const ALIAS_COLUMNS =
  'id, household_id, vendor_id, alias, alias_key, is_primary, source, created_at' as const;

const SOURCES: readonly AliasSource[] = ['manual', 'receipt', 'seed'];
const toSource = (s: string): AliasSource =>
  (SOURCES as readonly string[]).includes(s) ? (s as AliasSource) : 'manual';

/** The household's vendors, name ascending. */
export async function listVendors(householdId: string): Promise<Vendor[]> {
  const { data, error } = await supabase
    .from('vendors')
    .select(VENDOR_COLUMNS)
    .eq('household_id', householdId)
    .order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Every recognized name of the household's vendors (incl. primaries), alias ascending. */
export async function listAliases(householdId: string): Promise<VendorAlias[]> {
  const { data, error } = await supabase
    .from('vendor_aliases')
    .select(ALIAS_COLUMNS)
    .eq('household_id', householdId)
    .order('alias', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, source: toSource(row.source) }));
}

/**
 * Create a vendor; the DB trigger adds its primary alias. `name_key` is sent
 * only because the column is NOT NULL — the trigger recomputes it (authority).
 * A `23505` means the name is taken (as a name or someone's recognized name).
 */
export async function createVendor(input: {
  householdId: string;
  name: string;
}): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('vendors')
    .insert({ household_id: input.householdId, name: input.name, name_key: merchantKey(input.name) })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

/** Rename; the trigger keeps the primary alias in step (and absorbs an own alias with the new key). */
export async function renameVendor(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('vendors')
    .update({ name, name_key: merchantKey(name) })
    .eq('id', id);
  if (error) throw error;
}

/** Set (or clear with `null`) the category new transactions of this vendor default to. */
export async function setVendorDefaultCategory(
  id: string,
  categoryId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('vendors')
    .update({ default_category_id: categoryId })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Existing transactions of this vendor (any recognized name, the default's
 * kind) whose category differs from its default: counted (`dryRun`) or moved
 * onto the default. 0 when the vendor has no default.
 */
export async function recategorizeVendor(id: string, dryRun: boolean): Promise<number> {
  const { data, error } = await supabase.rpc('vendor_recategorize', {
    p_vendor: id,
    p_dry_run: dryRun,
  });
  if (error) throw error;
  return data ?? 0;
}

/** Delete a vendor and (cascade) its recognized names. Cards / lists are set null. */
export async function deleteVendor(id: string): Promise<void> {
  const { error } = await supabase.from('vendors').delete().eq('id', id);
  if (error) throw error;
}

/** Add a recognized name. A `23505` means another row already holds its key. */
export async function addAlias(input: {
  householdId: string;
  vendorId: string;
  alias: string;
  source: AliasSource;
}): Promise<void> {
  const { error } = await supabase.from('vendor_aliases').insert({
    household_id: input.householdId,
    vendor_id: input.vendorId,
    alias: input.alias,
    alias_key: merchantKey(input.alias),
    source: input.source,
  });
  if (error) throw error;
}

/** Remove a recognized name. Callers must refuse primary rows (the vendor's own name). */
export async function removeAlias(id: string): Promise<void> {
  const { error } = await supabase
    .from('vendor_aliases')
    .delete()
    .eq('id', id)
    .eq('is_primary', false);
  if (error) throw error;
}

/** Re-point one non-primary recognized name at another vendor. */
export async function moveAlias(id: string, toVendorId: string): Promise<void> {
  const { error } = await supabase
    .from('vendor_aliases')
    .update({ vendor_id: toVendorId })
    .eq('id', id)
    .eq('is_primary', false);
  if (error) throw error;
}

/** Fold `sourceId` into `targetId`: all its names (incl. its own) move over, then it is deleted. */
export async function mergeVendors(sourceId: string, targetId: string): Promise<void> {
  const { error } = await supabase.rpc('merge_vendors', { p_source: sourceId, p_target: targetId });
  if (error) throw error;
}

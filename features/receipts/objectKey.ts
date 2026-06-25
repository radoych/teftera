/**
 * Storage object key for a receipt image: `{householdId}/{uuid}.jpg`.
 * The first path segment is the household id, which Storage RLS authorizes
 * against. Pure and import-free so it stays unit-testable.
 */
export function buildReceiptObjectKey(householdId: string, uuid: string): string {
  if (!householdId) throw new Error('householdId is required to build a receipt key');
  if (!uuid) throw new Error('uuid is required to build a receipt key');
  return `${householdId}/${uuid}.jpg`;
}

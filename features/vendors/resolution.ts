// features/vendors/resolution.ts — the conflict sheet's five resolutions (pure orchestration).
import type { AliasConflict, Vendor, VendorIndex } from './types';

export type ConflictOption = 'merge' | 'move' | 'deleteOwner' | 'deleteEditing' | 'deleteBoth';

/**
 * Options in display order; the first is the recommended default. `move` is
 * offered only when the conflicting row is a recognized name — a vendor's own
 * name cannot be moved off it.
 */
export function conflictOptions(conflict: AliasConflict): ConflictOption[] {
  const all: ConflictOption[] = ['merge', 'move', 'deleteOwner', 'deleteEditing', 'deleteBoth'];
  return conflict.ownerAlias.is_primary ? all.filter((o) => o !== 'move') : all;
}

export const isDestructiveOption = (o: ConflictOption): boolean => o.startsWith('delete');

export interface ResolveConflictDeps {
  mergeVendors: (sourceId: string, targetId: string) => Promise<void>;
  moveAlias: (aliasId: string, toVendorId: string) => Promise<void>;
  deleteVendor: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  getIndex: () => VendorIndex;
}

export interface ResolveConflictContext {
  conflict: AliasConflict;
  /** The vendor the user was working on (adding a name to / renaming). */
  editing: Vendor;
  /**
   * Re-run the operation that hit the conflict (add the name, rename), given
   * the refreshed index. Called after `merge` / `move` / `deleteOwner` — the
   * key has been freed or now belongs to `editing`.
   */
  retry: (index: VendorIndex) => Promise<void>;
}

/**
 * Apply one resolution. Throws on failure (the sheet shows the error and stays
 * open). Resolves `{ editingDeleted }` so the detail screen knows to go back.
 */
export async function resolveConflict(
  option: ConflictOption,
  { conflict, editing, retry }: ResolveConflictContext,
  deps: ResolveConflictDeps,
): Promise<{ editingDeleted: boolean }> {
  const { owner, ownerAlias } = conflict;
  let shouldRetry = false;
  let editingDeleted = false;

  switch (option) {
    case 'merge':
      await deps.mergeVendors(owner.id, editing.id);
      shouldRetry = true;
      break;
    case 'move':
      if (ownerAlias.is_primary) throw new Error('cannot move a vendor name');
      await deps.moveAlias(ownerAlias.id, editing.id);
      shouldRetry = true;
      break;
    case 'deleteOwner':
      await deps.deleteVendor(owner.id);
      shouldRetry = true;
      break;
    case 'deleteEditing':
      await deps.deleteVendor(editing.id);
      editingDeleted = true;
      break;
    case 'deleteBoth':
      await deps.deleteVendor(owner.id);
      await deps.deleteVendor(editing.id);
      editingDeleted = true;
      break;
  }

  await deps.refresh();
  if (shouldRetry) {
    await retry(deps.getIndex());
    await deps.refresh();
  }
  return { editingDeleted };
}

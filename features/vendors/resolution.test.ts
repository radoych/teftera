import { alias, vendor, withPrimaries } from './fixtures';
import { buildVendorIndex } from './resolve';
import {
  conflictOptions,
  isDestructiveOption,
  resolveConflict,
  type ResolveConflictDeps,
} from './resolution';
import type { AliasConflict } from './types';

const owner = vendor('v1', 'Kaufland');
const editing = vendor('v2', 'Kaufland Stara');
const stara = alias('v1', 'KAUFLAND STARA ZAGORA', { id: 'al-1' });

const aliasConflict: AliasConflict = {
  attemptedAlias: 'Kaufland Stara Zagora',
  aliasKey: 'kaufland stara zagora',
  owner,
  ownerAlias: stara,
};
const nameConflict: AliasConflict = {
  attemptedAlias: 'kaufland',
  aliasKey: 'kaufland',
  owner,
  ownerAlias: alias('v1', 'Kaufland', { primary: true }),
};

const index = buildVendorIndex([owner, editing], withPrimaries([owner, editing], [stara]));

function setup() {
  const calls: string[] = [];
  const deps: ResolveConflictDeps = {
    mergeVendors: jest.fn(async (s: string, t: string) => {
      calls.push(`merge ${s}->${t}`);
    }),
    moveAlias: jest.fn(async (id: string, to: string) => {
      calls.push(`move ${id}->${to}`);
    }),
    deleteVendor: jest.fn(async (id: string) => {
      calls.push(`delete ${id}`);
    }),
    refresh: jest.fn(async () => {
      calls.push('refresh');
    }),
    getIndex: jest.fn(() => index),
  };
  const retry = jest.fn(async () => {
    calls.push('retry');
  });
  return { calls, deps, retry };
}

describe('conflictOptions', () => {
  it('offers all five for a recognized-name conflict, merge first', () => {
    expect(conflictOptions(aliasConflict)).toEqual([
      'merge',
      'move',
      'deleteOwner',
      'deleteEditing',
      'deleteBoth',
    ]);
  });

  it('drops "move" when the key is the owner vendor\'s own name', () => {
    expect(conflictOptions(nameConflict)).not.toContain('move');
  });

  it('flags the delete options as destructive', () => {
    expect(isDestructiveOption('merge')).toBe(false);
    expect(isDestructiveOption('move')).toBe(false);
    expect(isDestructiveOption('deleteBoth')).toBe(true);
  });
});

describe('resolveConflict', () => {
  it('merge folds the owner into the editing vendor, then retries', async () => {
    const { calls, deps, retry } = setup();
    await expect(
      resolveConflict('merge', { conflict: aliasConflict, editing, retry }, deps),
    ).resolves.toEqual({ editingDeleted: false });
    expect(calls).toEqual(['merge v1->v2', 'refresh', 'retry', 'refresh']);
    expect(retry).toHaveBeenCalledWith(index);
  });

  it('move re-points only the conflicting name, then retries', async () => {
    const { calls, deps, retry } = setup();
    await resolveConflict('move', { conflict: aliasConflict, editing, retry }, deps);
    expect(calls).toEqual(['move al-1->v2', 'refresh', 'retry', 'refresh']);
  });

  it('refuses to move a vendor name', async () => {
    const { deps, retry } = setup();
    await expect(
      resolveConflict('move', { conflict: nameConflict, editing, retry }, deps),
    ).rejects.toThrow();
    expect(deps.moveAlias).not.toHaveBeenCalled();
  });

  it('deleteOwner deletes the owner, then retries', async () => {
    const { calls, deps, retry } = setup();
    await resolveConflict('deleteOwner', { conflict: aliasConflict, editing, retry }, deps);
    expect(calls).toEqual(['delete v1', 'refresh', 'retry', 'refresh']);
  });

  it('deleteEditing deletes the vendor being edited and does not retry', async () => {
    const { calls, deps, retry } = setup();
    await expect(
      resolveConflict('deleteEditing', { conflict: aliasConflict, editing, retry }, deps),
    ).resolves.toEqual({ editingDeleted: true });
    expect(calls).toEqual(['delete v2', 'refresh']);
  });

  it('deleteBoth deletes both and does not retry', async () => {
    const { calls, deps, retry } = setup();
    await expect(
      resolveConflict('deleteBoth', { conflict: aliasConflict, editing, retry }, deps),
    ).resolves.toEqual({ editingDeleted: true });
    expect(calls).toEqual(['delete v1', 'delete v2', 'refresh']);
  });

  it('propagates a failure so the sheet can stay open', async () => {
    const { deps, retry } = setup();
    deps.mergeVendors = jest.fn(async () => {
      throw new Error('offline');
    });
    await expect(
      resolveConflict('merge', { conflict: aliasConflict, editing, retry }, deps),
    ).rejects.toThrow('offline');
    expect(retry).not.toHaveBeenCalled();
  });
});

import { cardChoice, openOrCreateList, type OpenOrCreateDeps } from './create';
import { makeList } from './fixtures';
import type { ShoppingList } from './types';

describe('cardChoice', () => {
  it('attaches nothing when the vendor has no cards', () => {
    expect(cardChoice([])).toEqual({ kind: 'resolved', cardId: null });
  });

  it('attaches the only card automatically', () => {
    expect(cardChoice([{ id: 'c1' }])).toEqual({ kind: 'resolved', cardId: 'c1' });
  });

  it('asks when there are several', () => {
    expect(cardChoice([{ id: 'c1' }, { id: 'c2' }])).toEqual({ kind: 'pick' });
  });
});

describe('openOrCreateList', () => {
  const input = {
    householdId: 'h1',
    vendorId: 'v1',
    name: 'Kaufland',
    loyaltyCardId: 'c1',
    createdBy: 'u1',
  };

  function deps(overrides: Partial<OpenOrCreateDeps> = {}, lists: ShoppingList[] = []) {
    let current = lists;
    const d: OpenOrCreateDeps = {
      getLists: () => current,
      createList: jest.fn(async () => ({ id: 'new' })),
      refresh: jest.fn(async () => {}),
      ...overrides,
    };
    return { d, setLists: (l: ShoppingList[]) => (current = l) };
  }

  it('opens the existing list for the vendor without writing', async () => {
    const { d } = deps({}, [makeList({ id: 'existing', vendor_id: 'v1' })]);
    await expect(openOrCreateList(input, d)).resolves.toEqual({ id: 'existing', created: false });
    expect(d.createList).not.toHaveBeenCalled();
  });

  it('creates a list and refreshes before returning', async () => {
    const { d } = deps();
    await expect(openOrCreateList(input, d)).resolves.toEqual({ id: 'new', created: true });
    expect(d.createList).toHaveBeenCalledWith(input);
    expect(d.refresh).toHaveBeenCalledWith('h1');
  });

  it('still returns the new id when the follow-up refresh fails', async () => {
    const { d } = deps({ refresh: jest.fn(async () => Promise.reject(new Error('offline'))) });
    await expect(openOrCreateList(input, d)).resolves.toEqual({ id: 'new', created: true });
  });

  it('on a one-per-vendor race, refreshes and opens the list the other phone created', async () => {
    const holder = deps();
    const { d, setLists } = holder;
    d.createList = jest.fn(async () => Promise.reject({ code: '23505' }));
    d.refresh = jest.fn(async () => {
      setLists([makeList({ id: 'raced', vendor_id: 'v1' })]);
    });
    await expect(openOrCreateList(input, d)).resolves.toEqual({ id: 'raced', created: false });
  });

  it('rethrows other errors', async () => {
    const { d } = deps({ createList: jest.fn(async () => Promise.reject(new Error('boom'))) });
    await expect(openOrCreateList(input, d)).rejects.toThrow('boom');
  });

  it('rethrows a unique violation when no list shows up after refreshing', async () => {
    const { d } = deps({ createList: jest.fn(async () => Promise.reject({ code: '23505' })) });
    await expect(openOrCreateList(input, d)).rejects.toEqual({ code: '23505' });
  });

  it('never looks up an existing list for a list without a vendor', async () => {
    const { d } = deps({}, [makeList({ id: 'orphan', vendor_id: null })]);
    await expect(openOrCreateList({ ...input, vendorId: null }, d)).resolves.toEqual({
      id: 'new',
      created: true,
    });
  });
});

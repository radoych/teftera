import { makeItem, makeList } from './fixtures';
import {
  applyPending,
  createOptimisticEngine,
  type PendingOp,
  type ShoppingData,
} from './optimistic';

const T = '2026-11-02T10:00:00.000Z';
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

function deferred() {
  let resolve!: () => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Let queued promise callbacks run. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

const server: ShoppingData = {
  lists: [makeList({ id: 'l1' }), makeList({ id: 'l2' })],
  items: [
    makeItem({ id: 'a', list_id: 'l1', position: 0 }),
    makeItem({ id: 'b', list_id: 'l1', position: 1, checked_at: T, checked_by: 'u2' }),
    makeItem({ id: 'c', list_id: 'l2', position: 0, checked_at: T }),
  ],
};

describe('applyPending', () => {
  it('returns the server data unchanged when nothing is pending', () => {
    expect(applyPending(server, [])).toBe(server);
  });

  it('checks / unchecks an item', () => {
    const { items } = applyPending(server, [
      { kind: 'check', itemId: 'a', checkedAt: T, checkedBy: 'u1' },
      { kind: 'check', itemId: 'b', checkedAt: null, checkedBy: null },
    ]);
    expect(items.find((i) => i.id === 'a')).toMatchObject({ checked_at: T, checked_by: 'u1' });
    expect(items.find((i) => i.id === 'b')).toMatchObject({ checked_at: null, checked_by: null });
  });

  it('applies ops in order — the last toggle of an item wins', () => {
    const { items } = applyPending(server, [
      { kind: 'check', itemId: 'a', checkedAt: T, checkedBy: 'u1' },
      { kind: 'check', itemId: 'a', checkedAt: null, checkedBy: null },
    ]);
    expect(items.find((i) => i.id === 'a')?.checked_at).toBeNull();
  });

  it('appends an added item, but never duplicates one the server already returned', () => {
    const added = makeItem({ id: 'n', list_id: 'l1', position: 2 });
    expect(ids(applyPending(server, [{ kind: 'addItem', item: added }]).items)).toEqual([
      'a',
      'b',
      'c',
      'n',
    ]);
    const landed = { ...server, items: [...server.items, { ...added, name: 'server' }] };
    const { items } = applyPending(landed, [{ kind: 'addItem', item: added }]);
    expect(ids(items)).toEqual(['a', 'b', 'c', 'n']);
    expect(items.find((i) => i.id === 'n')?.name).toBe('server');
  });

  it('edits and removes items', () => {
    const { items } = applyPending(server, [
      { kind: 'updateItem', itemId: 'a', name: 'хляб', quantity: '2' },
      { kind: 'removeItem', itemId: 'c' },
    ]);
    expect(ids(items)).toEqual(['a', 'b']);
    expect(items[0]).toMatchObject({ name: 'хляб', quantity: '2' });
  });

  it('clears only the checked items of one list, as of that op', () => {
    const { items } = applyPending(server, [
      { kind: 'clearChecked', listId: 'l1' },
      // Checked after the clear → survives it.
      { kind: 'check', itemId: 'a', checkedAt: T, checkedBy: 'u1' },
    ]);
    expect(ids(items)).toEqual(['a', 'c']);
  });

  it('sets a list card and removes a list with its items', () => {
    const data = applyPending(server, [
      { kind: 'setCard', listId: 'l2', cardId: 'card1' },
      { kind: 'removeList', listId: 'l1' },
    ]);
    expect(ids(data.lists)).toEqual(['l2']);
    expect(data.lists[0]?.loyalty_card_id).toBe('card1');
    expect(ids(data.items)).toEqual(['c']);
  });

  it('ignores ops on rows that no longer exist', () => {
    const ops: PendingOp[] = [
      { kind: 'check', itemId: 'gone', checkedAt: T, checkedBy: 'u1' },
      { kind: 'setCard', listId: 'gone', cardId: 'x' },
    ];
    expect(applyPending(server, ops)).toEqual(server);
  });
});

describe('createOptimisticEngine', () => {
  function setup() {
    const views: ShoppingData[] = [];
    const deps = {
      publish: jest.fn((v: ShoppingData) => views.push(v)),
      refresh: jest.fn(),
      onError: jest.fn(),
    };
    const engine = createOptimisticEngine(deps);
    engine.setServer(server, engine.mark());
    const last = () => views[views.length - 1] as ShoppingData;
    const itemA = () => last().items.find((i) => i.id === 'a');
    return { engine, deps, last, itemA };
  }

  const checkA: PendingOp = { kind: 'check', itemId: 'a', checkedAt: T, checkedBy: 'u1' };

  it('publishes the optimistic state before the write resolves', () => {
    const { engine, itemA } = setup();
    const write = deferred();
    void engine.run(checkA, () => write.promise);
    expect(itemA()?.checked_at).toBe(T);
  });

  it('keeps the optimistic state when a load that started before the commit lands', async () => {
    const { engine, itemA } = setup();
    const write = deferred();
    const done = engine.run(checkA, () => write.promise);
    await flush();

    const staleMark = engine.mark(); // fetch starts before the write commits
    write.resolve();
    await done;
    engine.setServer(server, staleMark); // …and lands after, without the write
    expect(itemA()?.checked_at).toBe(T);
  });

  it('drops the overlay once a load that started after the commit lands', async () => {
    const { engine, deps, itemA } = setup();
    const write = deferred();
    const done = engine.run(checkA, () => write.promise);
    await flush();
    write.resolve();
    await expect(done).resolves.toBe(true);
    expect(deps.refresh).toHaveBeenCalledTimes(1);

    // The fresh fetch (started after commit) is server truth — here the other
    // phone unchecked it again in between, and that must win.
    engine.setServer(server, engine.mark());
    expect(itemA()?.checked_at).toBeNull();
    expect(engine.pendingCount()).toBe(0);
  });

  it('reverts and reports a failed write', async () => {
    const { engine, deps, itemA } = setup();
    const err = new Error('offline');
    const write = deferred();
    const done = engine.run(checkA, () => write.promise);
    await flush();
    write.reject(err);
    await expect(done).resolves.toBe(false);
    expect(itemA()?.checked_at).toBeNull();
    expect(deps.onError).toHaveBeenCalledWith(err, checkA);
    expect(deps.refresh).not.toHaveBeenCalled();
  });

  it('runs writes one at a time, in order, even after a failure', async () => {
    const { engine } = setup();
    const order: string[] = [];
    const first = deferred();
    const p1 = engine.run(checkA, async () => {
      order.push('1:start');
      await first.promise;
      order.push('1:end');
    });
    const p2 = engine.run({ ...checkA, checkedAt: null, checkedBy: null }, async () => {
      order.push('2:start');
    });
    await flush();
    expect(order).toEqual(['1:start']);
    first.reject(new Error('x'));
    await Promise.all([p1, p2]);
    expect(order).toEqual(['1:start', '2:start']);
  });

  it('a later unchecked toggle stays visible after an earlier check fails', async () => {
    const { engine, itemA } = setup();
    const first = deferred();
    void engine.run(checkA, () => first.promise);
    const p2 = engine.run({ ...checkA, checkedAt: null, checkedBy: null }, () => Promise.resolve());
    first.reject(new Error('x'));
    await p2;
    expect(itemA()?.checked_at).toBeNull();
  });

  it('reset clears pending ops and server data', () => {
    const { engine, last } = setup();
    void engine.run(checkA, () => new Promise<void>(() => {}));
    engine.reset();
    expect(engine.pendingCount()).toBe(0);
    expect(last()).toEqual({ lists: [], items: [] });
  });

  it('a write that commits after reset does not resurrect its op', async () => {
    const { engine, last } = setup();
    const write = deferred();
    const done = engine.run(checkA, () => write.promise);
    engine.reset();
    write.resolve();
    await done;
    expect(engine.pendingCount()).toBe(0);
    expect(last()).toEqual({ lists: [], items: [] });
  });
});

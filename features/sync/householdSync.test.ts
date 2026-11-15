import { createHouseholdSync, type HouseholdSyncDeps } from './householdSync';
import type { HouseholdTable } from './realtimeChannel';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Flush pending microtasks (promise continuations) without advancing timers. */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

function setup(tables: readonly HouseholdTable[] = ['transactions']) {
  const pending: Deferred<string>[] = [];
  const applied: string[] = [];
  const listeners = new Map<HouseholdTable, () => void>();
  const unsubscribed: HouseholdTable[] = [];
  const errors: unknown[] = [];
  let clock = 0;

  const deps: HouseholdSyncDeps = {
    subscribe: (table, _householdId, onChange) => {
      listeners.set(table, onChange);
      return () => unsubscribed.push(table);
    },
    now: () => clock,
  };
  const load = jest.fn((householdId: string) => {
    const d = deferred<string>();
    pending.push(d);
    return d.promise.then((v) => `${householdId}:${v}`);
  });
  const reset = jest.fn();
  const onStart = jest.fn();
  const sync = createHouseholdSync(
    {
      label: 'test',
      tables,
      load,
      apply: (data) => applied.push(data),
      reset,
      onStart,
      onError: (err) => errors.push(err),
      debounceMs: 400,
      settleMs: 750,
    },
    deps,
  );

  /** Resolve the oldest outstanding load. */
  async function settle(value = 'ok'): Promise<void> {
    const d = pending.shift();
    if (!d) throw new Error('no pending load');
    d.resolve(value);
    await flush();
  }

  /** Reject the oldest outstanding load. */
  async function fail(err: unknown): Promise<void> {
    const d = pending.shift();
    if (!d) throw new Error('no pending load');
    d.reject(err);
    await flush();
  }

  /** Fire a realtime change on `table` without running the debounce. */
  function emit(table: HouseholdTable): void {
    listeners.get(table)?.();
  }

  /** Fire a realtime change on `table` and run the debounce. */
  async function change(table: HouseholdTable = 'transactions'): Promise<void> {
    listeners.get(table)?.();
    jest.advanceTimersByTime(400);
    clock += 400;
    await flush();
  }

  return {
    sync,
    load,
    reset,
    onStart,
    applied,
    unsubscribed,
    errors,
    settle,
    fail,
    emit,
    change,
    tick: (ms: number) => {
      clock += ms;
    },
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('createHouseholdSync', () => {
  it('start: runs onStart, loads once, applies, subscribes every table', async () => {
    const t = setup(['vendors', 'vendor_aliases']);
    t.sync.start('H');
    await flush();
    expect(t.onStart).toHaveBeenCalledWith('H');
    expect(t.load).toHaveBeenCalledTimes(1);
    await t.settle();
    expect(t.applied).toEqual(['H:ok']);
  });

  it('coalesces: a realtime change while a load is in flight does not start another', async () => {
    const t = setup();
    t.sync.start('H');
    await flush();
    await t.change();
    expect(t.load).toHaveBeenCalledTimes(1);
    await t.settle();
    expect(t.applied).toEqual(['H:ok']);
  });

  it('settle-skip: the realtime echo of our own refresh does not reload', async () => {
    const t = setup();
    t.sync.start('H');
    await flush();
    await t.settle();

    t.tick(5000);
    const refreshed = t.sync.refresh('H'); // after a write
    await flush();
    await t.settle();
    await refreshed;
    expect(t.load).toHaveBeenCalledTimes(2);

    await t.change(); // echo arrives 400ms later — inside the 750ms window
    expect(t.load).toHaveBeenCalledTimes(2);
  });

  it('a realtime change after the settle window reloads', async () => {
    const t = setup();
    t.sync.start('H');
    await flush();
    await t.settle();
    t.tick(750);
    await t.change();
    expect(t.load).toHaveBeenCalledTimes(2);
  });

  it('several tables funnel into one debounced reload', async () => {
    const t = setup(['vendors', 'vendor_aliases']);
    t.sync.start('H');
    await flush();
    await t.settle();
    t.tick(10_000);
    t.emit('vendors');
    await t.change('vendor_aliases'); // inside the same 400ms debounce
    expect(t.load).toHaveBeenCalledTimes(2);
  });

  it('refresh while a load is in flight queues exactly one follow-up shared by all callers', async () => {
    const t = setup();
    t.sync.start('H');
    await flush();
    const a = t.sync.refresh('H');
    const b = t.sync.refresh('H');
    expect(a).toBe(b);
    expect(t.load).toHaveBeenCalledTimes(1);

    await t.settle('first');
    expect(t.load).toHaveBeenCalledTimes(2); // follow-up started only after the first settled
    await t.settle('second');
    await expect(a).resolves.toBeUndefined();
    expect(t.applied).toEqual(['H:first', 'H:second']);
  });

  it('refresh when idle loads immediately and rejects when that load fails', async () => {
    const t = setup();
    const p = t.sync.refresh('H');
    await flush();
    expect(t.load).toHaveBeenCalledTimes(1);
    const assertion = expect(p).rejects.toThrow('offline');
    await t.fail(new Error('offline'));
    await assertion;
    expect(t.errors).toEqual([]); // explicit refreshes reject; onError is for background loads
  });

  it('drops a result that lands after cleanup, and unsubscribes', async () => {
    const t = setup();
    const cleanup = t.sync.start('H');
    await flush();
    cleanup();
    await t.settle();
    expect(t.applied).toEqual([]);
    expect(t.unsubscribed).toEqual(['transactions']);
  });

  it('reset clears the store and drops in-flight results', async () => {
    const t = setup();
    void t.sync.refresh('H');
    await flush();
    t.sync.reset();
    expect(t.reset).toHaveBeenCalledTimes(1);
    await t.settle();
    expect(t.applied).toEqual([]);
  });

  it('a failed background load reports through onError and does not block later loads', async () => {
    const t = setup();
    t.sync.start('H');
    await flush();
    await t.fail(new Error('offline'));
    expect(t.errors).toHaveLength(1);
    await t.change();
    expect(t.load).toHaveBeenCalledTimes(2);
    await t.settle();
    expect(t.applied).toEqual(['H:ok']);
  });
});

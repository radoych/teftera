import { createBrightnessBoost, type BrightnessDeps } from './brightness';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function fakeDeps(initial = 0.4) {
  const calls: string[] = [];
  const deps: BrightnessDeps = {
    get: jest.fn(async () => {
      calls.push('get');
      return initial;
    }),
    set: jest.fn(async (v: number) => {
      calls.push(`set:${v}`);
    }),
    restore: jest.fn(async (v: number) => {
      calls.push(`restore:${v}`);
    }),
  };
  return { deps, calls };
}

describe('createBrightnessBoost', () => {
  it('remembers the original, maxes brightness, and restores it on release', async () => {
    const { deps, calls } = fakeDeps(0.4);
    const boost = createBrightnessBoost(deps);
    await boost.boost();
    await boost.release();
    expect(calls).toEqual(['get', 'set:1', 'restore:0.4']);
  });

  it('re-reads the original after a release (background → active)', async () => {
    const { deps, calls } = fakeDeps(0.4);
    const boost = createBrightnessBoost(deps);
    await boost.boost();
    await boost.release();
    await boost.boost();
    expect(calls).toEqual(['get', 'set:1', 'restore:0.4', 'get', 'set:1']);
  });

  it('does not re-read while already boosted', async () => {
    const { deps, calls } = fakeDeps(0.4);
    const boost = createBrightnessBoost(deps);
    await boost.boost();
    await boost.boost();
    expect(calls).toEqual(['get', 'set:1', 'set:1']);
  });

  it('release without a boost is a no-op', async () => {
    const { deps, calls } = fakeDeps();
    await createBrightnessBoost(deps).release();
    expect(calls).toEqual([]);
  });

  it('a release that lands before the read resolves never maxes brightness', async () => {
    const read = deferred<number>();
    const calls: string[] = [];
    const deps: BrightnessDeps = {
      get: () => read.promise,
      set: async (v) => {
        calls.push(`set:${v}`);
      },
      restore: async (v) => {
        calls.push(`restore:${v}`);
      },
    };
    const boost = createBrightnessBoost(deps);
    const pending = boost.boost();
    await boost.release();
    read.resolve(0.3);
    await pending;
    expect(calls).toEqual([]);
  });

  it('swallows native failures', async () => {
    const deps: BrightnessDeps = {
      get: () => Promise.reject(new Error('unsupported')),
      set: () => Promise.reject(new Error('unsupported')),
      restore: () => Promise.reject(new Error('unsupported')),
    };
    const boost = createBrightnessBoost(deps);
    await expect(boost.boost()).resolves.toBeUndefined();
    await expect(boost.release()).resolves.toBeUndefined();
  });
});

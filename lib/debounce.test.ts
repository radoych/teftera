import { trailingDebounce } from './debounce';

describe('trailingDebounce', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('collapses a burst into one trailing call', () => {
    const fn = jest.fn();
    const d = trailingDebounce(fn, 400);
    d.call(); d.call(); d.call();
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(400);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancel prevents the pending call', () => {
    const fn = jest.fn();
    const d = trailingDebounce(fn, 400);
    d.call();
    d.cancel();
    jest.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});

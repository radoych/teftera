import { useEffect, useState } from 'react';
import { trailingDebounce } from './debounce';

/**
 * `value`, but only after it has stopped changing for `ms`. Used to keep
 * per-keystroke work (filter + group over a year of rows) off the typing path.
 */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const d = trailingDebounce(() => setDebounced(value), ms);
    d.call();
    return d.cancel;
  }, [value, ms]);

  return debounced;
}

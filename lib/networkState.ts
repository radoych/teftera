export interface NetworkStateLike {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
}

/**
 * Offline only on positive evidence — unknown state (app startup, simulator
 * quirks) must not flash the banner or disable actions.
 */
export function deriveIsOnline(state: NetworkStateLike): boolean {
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}

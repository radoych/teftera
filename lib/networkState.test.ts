import { deriveIsOnline } from './networkState';

describe('deriveIsOnline', () => {
  it('is optimistic while state is unknown (startup)', () => {
    expect(deriveIsOnline({})).toBe(true);
    expect(deriveIsOnline({ isConnected: undefined, isInternetReachable: undefined })).toBe(true);
  });
  it('offline when the OS reports no connection', () => {
    expect(deriveIsOnline({ isConnected: false, isInternetReachable: null })).toBe(false);
  });
  it('offline when connected but internet is unreachable (captive wifi)', () => {
    expect(deriveIsOnline({ isConnected: true, isInternetReachable: false })).toBe(false);
  });
  it('online when connected and reachability is unknown-or-good', () => {
    expect(deriveIsOnline({ isConnected: true, isInternetReachable: null })).toBe(true);
    expect(deriveIsOnline({ isConnected: true, isInternetReachable: true })).toBe(true);
  });
});

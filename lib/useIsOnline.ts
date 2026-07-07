import { useNetworkState } from 'expo-network';
import { deriveIsOnline } from './networkState';

/** Live connectivity flag; true unless the device is positively offline. */
export function useIsOnline(): boolean {
  return deriveIsOnline(useNetworkState());
}

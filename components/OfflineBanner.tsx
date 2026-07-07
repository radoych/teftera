import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsOnline } from '@/lib/useIsOnline';

/** Slim top overlay shown while the device has no usable connection. */
export function OfflineBanner() {
  const online = useIsOnline();
  const insets = useSafeAreaInsets();
  if (online) return null;
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, right: 0, top: 0, paddingTop: insets.top }}
      className="items-center bg-error-container pb-1">
      <Text className="pt-1 font-inter-medium text-label-md uppercase text-error">
        Няма връзка с интернет
      </Text>
    </View>
  );
}

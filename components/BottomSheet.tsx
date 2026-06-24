import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Slide-up sheet shell: translucent scrim, rounded `surface-container` panel,
 * grabber handle, bottom safe-area. Tap-scrim / Android back close it.
 * The one source of truth for the app's bottom sheets.
 */
export function BottomSheet({ visible, onClose, children }: BottomSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
        <Pressable className="rounded-t-3xl bg-surface-container" onPress={() => {}}>
          <SafeAreaView edges={['bottom']}>
            <View className="items-center py-2">
              <View className="h-1 w-10 rounded-full bg-outline" />
            </View>
            {children}
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

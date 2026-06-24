import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** Drag the grabber down past this many px to dismiss. */
const CLOSE_THRESHOLD = 80;

/**
 * The sliding panel. Rendered only while open, so its drag value is always fresh
 * and the `entering` slide-up replays on every open. Drag the grabber down to
 * dismiss; the drag value is written only inside worklets (no effect touches it).
 */
function SheetPanel({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const dragY = useSharedValue(0);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      dragY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > CLOSE_THRESHOLD) {
        runOnJS(onClose)();
      } else {
        dragY.value = withTiming(0, { duration: 150 });
      }
    });

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.value }] }));

  return (
    <Animated.View
      entering={SlideInDown.duration(250)}
      style={[style, { position: 'absolute', left: 0, right: 0, bottom: 0 }]}
      className="rounded-t-3xl bg-surface-container">
      <SafeAreaView edges={['bottom']}>
        <GestureDetector gesture={pan}>
          <View className="items-center py-3">
            <View className="h-1 w-10 rounded-full bg-outline" />
          </View>
        </GestureDetector>
        {children}
      </SafeAreaView>
    </Animated.View>
  );
}

/**
 * Bottom sheet: the scrim darkens the whole screen instantly (no slide), the
 * panel animates up from the bottom, and dragging the grabber down dismisses it.
 * Content lives in a plain animated view (not a Pressable) so nested scrollables
 * — wheels, lists — reliably receive their touches. The one source of truth for
 * the app's bottom sheets.
 */
export function BottomSheet({ visible, onClose, children }: BottomSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        {/* Full-screen scrim — appears instantly, no slide. */}
        <Pressable style={StyleSheet.absoluteFill} className="bg-black/50" onPress={onClose} />
        {visible ? <SheetPanel onClose={onClose}>{children}</SheetPanel> : null}
      </View>
    </Modal>
  );
}

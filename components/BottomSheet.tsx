import { type ReactNode, useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  SlideInDown,
  SlideOutDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

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
 * On removal it slides back down (`exiting`) and fires `onClosed` so the host can
 * unmount the Modal only after the slide-out has finished playing.
 */
function SheetPanel({
  onClose,
  onClosed,
  children,
}: {
  onClose: () => void;
  onClosed: () => void;
  children: ReactNode;
}) {
  const dragY = useSharedValue(0);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // `height` is 0 closed and -keyboardHeight open (animated); `progress` 0 -> 1.
  const { height: kbHeight, progress: kbProgress } = useReanimatedKeyboardAnimation();
  // The Modal window never resizes for the IME (edge-to-edge), so lift the panel
  // by the keyboard height ourselves. The panel's own bottom safe-area padding is
  // dead space once the keyboard covers the nav bar, so subtract it back out.
  // maxHeight caps the panel to the space above the keyboard.
  const liftStyle = useAnimatedStyle(() => ({
    bottom: -kbHeight.value - insets.bottom * kbProgress.value,
    maxHeight: windowHeight - insets.top - Math.max(0, -kbHeight.value),
  }));

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

  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value }],
  }));

  // Two nested views on purpose: the OUTER owns the enter/exit slide (layout
  // animations), the INNER owns the drag transform. Putting both a layout
  // animation and a `useAnimatedStyle` transform on one node makes Reanimated
  // leave a residual transform after the entrance — the panel rests a few px off
  // until the shared value is next written (which is why a stray swipe "fixed"
  // the bottom gap). Separating the nodes keeps each transform clean.
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, right: 0 }, liftStyle]}>
      <Animated.View
        entering={SlideInDown.duration(250)}
        exiting={SlideOutDown.duration(200).withCallback((finished) => {
          'worklet';
          if (finished) runOnJS(onClosed)();
        })}
        style={{ flexShrink: 1 }}
      >
        <Animated.View
          style={[dragStyle, { flexShrink: 1 }]}
          className="rounded-t-3xl bg-surface-container"
        >
          <SafeAreaView edges={['bottom']} style={{ flexShrink: 1 }}>
            <GestureDetector gesture={pan}>
              <View className="items-center py-3">
                <View className="h-1 w-10 rounded-full bg-outline" />
              </View>
            </GestureDetector>
            {children}
          </SafeAreaView>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * Bottom sheet: the scrim darkens the whole screen instantly (no slide), the
 * panel animates up from the bottom, and dragging the grabber down dismisses it.
 * Content lives in a plain animated view (not a Pressable) so nested scrollables
 * — wheels, lists — reliably receive their touches. The one source of truth for
 * the app's bottom sheets.
 *
 * The Modal stays mounted (`mounted`) a beat past `visible` going false so the
 * panel's slide-out can play; the panel's `exiting` callback then flips `mounted`
 * off and the Modal unmounts. Tying the Modal directly to `visible` would tear
 * the panel out before any exit animation had a chance to run.
 */
export function BottomSheet({ visible, onClose, children }: BottomSheetProps) {
  const [mounted, setMounted] = useState(visible);
  const { width, height } = useWindowDimensions();

  // Open immediately when `visible` turns true. Adjusting state during render is
  // React's recommended way to sync to a prop change without an extra effect pass.
  if (visible && !mounted) setMounted(true);

  if (!mounted) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      {/* A Modal renders into its own native view tree, outside the root
          GestureHandlerRootView in _layout.tsx. Without this nested root, no
          gesture inside the sheet (grabber drag, reorder handles) ever fires.
          It MUST be sized with explicit window dimensions, not `flex: 1`: inside
          a Modal on Android a flex-sized GestureHandlerRootView measures short on
          first layout, so the panel pinned to its `bottom: 0` floated above the
          real screen bottom (the gap) until a touch forced a remeasure. */}
      <GestureHandlerRootView style={{ width, height }}>
        {/* Full-screen scrim — appears instantly, no slide. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          className="bg-black/50"
          onPress={onClose}
        />
        {visible ? (
          <SheetPanel onClose={onClose} onClosed={() => setMounted(false)}>
            {children}
          </SheetPanel>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

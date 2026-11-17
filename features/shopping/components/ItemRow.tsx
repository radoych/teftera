// features/shopping/components/ItemRow.tsx — the animated check row (spec §8.5).
import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  FadeOut,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { rowEntering, rowExiting, rowLayout, TIMING_FAST } from '@/lib/animation';
import { colors } from '@/lib/theme';
import type { ShoppingListItem } from '../types';

/** Width of the red delete area; swiping past `DELETE_THRESHOLD` deletes. */
const ACTION_WIDTH = 120;
const DELETE_THRESHOLD = 96;
/** Strike-through draw time (ms). */
const STRIKE_MS = 180;

export interface ItemRowProps {
  item: ShoppingListItem;
  /** Visual checked state (the row animates whenever it flips — also for the other phone's taps). */
  checked: boolean;
  /** Small trailing note on taken rows, e.g. the other member's name. */
  takenBy?: string | null;
  onToggle: (item: ShoppingListItem) => void;
  onDelete: (item: ShoppingListItem) => void;
  onLongPress: (item: ShoppingListItem) => void;
  /** Stagger for a bulk exit ("Изчисти взетите"), ms. */
  exitDelay?: number;
  showDivider?: boolean;
}

function Checkbox({ checked }: { checked: boolean }) {
  const progress = useSharedValue(checked ? 1 : 0);
  const mounted = useRef(false);

  useEffect(() => {
    // The initial state is set without motion; only later flips animate.
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (checked) {
      progress.value = withTiming(1, TIMING_FAST);
    } else {
      progress.value = withTiming(0, TIMING_FAST);
    }
  }, [checked, progress]);

  const boxStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      ['transparent', colors.primaryContainer],
    ),
    borderColor: interpolateColor(
      progress.value,
      [0, 1],
      [colors.outlineVariant, colors.primaryContainer],
    ),
  }));
  const glyphStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  return (
    <Animated.View style={[styles.box, boxStyle]}>
      <Animated.View style={glyphStyle}>
        <MaterialIcons name="check" size={16} color={colors.onPrimary} />
      </Animated.View>
    </Animated.View>
  );
}

/** Name + quantity chip, fading and struck through when checked. */
function Label({ item, checked, takenBy }: { item: ShoppingListItem; checked: boolean; takenBy?: string | null }) {
  const textWidth = useSharedValue(0);
  const fade = useSharedValue(checked ? 0.45 : 1);
  const strike = useSharedValue(checked ? 1 : 0);

  useEffect(() => {
    fade.value = withTiming(checked ? 0.45 : 1, TIMING_FAST);
    strike.value = withTiming(checked ? 1 : 0, { duration: STRIKE_MS });
  }, [checked, fade, strike]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const strikeStyle = useAnimatedStyle(() => ({ width: strike.value * textWidth.value }));

  return (
    <Animated.View style={fadeStyle} className="flex-1 flex-row items-center gap-sm">
      <View className="shrink">
        <Text
          className="font-inter text-body-lg text-on-surface"
          numberOfLines={1}
          onLayout={(e) => {
            textWidth.value = e.nativeEvent.layout.width;
          }}>
          {item.name}
        </Text>
        <Animated.View pointerEvents="none" style={[styles.strike, strikeStyle]} />
      </View>
      {item.quantity ? (
        <View className="rounded-full bg-surface-container-high px-2 py-0.5">
          <Text className="font-inter-medium text-label-md text-on-surface-variant">
            {item.quantity}
          </Text>
        </View>
      ) : null}
      {checked && takenBy ? (
        <Text
          className="ml-auto font-inter text-label-md text-on-surface-variant opacity-70"
          numberOfLines={1}>
          {takenBy}
        </Text>
      ) : null}
    </Animated.View>
  );
}

function DeleteAction() {
  return (
    <View style={styles.action} className="items-end justify-center bg-error-container pr-lg">
      <MaterialIcons name="delete" size={22} color={colors.error} />
    </View>
  );
}

/**
 * One shopping item. Layout animation on the OUTER node (rows slide between the
 * open and "Взети" groups); the checkbox's own styles live on an inner node
 * (never both on one node — see components/BottomSheet.tsx). Swipe left past
 * 96 px to delete; long-press to edit.
 */
export function ItemRow({
  item,
  checked,
  takenBy,
  onToggle,
  onDelete,
  onLongPress,
  exitDelay = 0,
  showDivider = true,
}: ItemRowProps) {
  // Builders mutate in place, so a delayed exit needs its own instance — never
  // call `.delay()` on the shared `rowExiting` preset.
  const exiting = useMemo(
    () => (exitDelay > 0 ? FadeOut.duration(140).delay(exitDelay) : rowExiting),
    [exitDelay],
  );

  return (
    <Animated.View
      layout={rowLayout}
      entering={rowEntering}
      exiting={exiting}
      style={showDivider ? styles.divider : undefined}>
      <ReanimatedSwipeable
        friction={1.5}
        overshootRight={false}
        rightThreshold={DELETE_THRESHOLD}
        renderRightActions={() => <DeleteAction />}
        onSwipeableWillOpen={() => onDelete(item)}>
        <Pressable
          onPress={() => onToggle(item)}
          onLongPress={() => onLongPress(item)}
          delayLongPress={350}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          accessibilityLabel={item.quantity ? `${item.name}, ${item.quantity}` : item.name}
          className="h-14 flex-row items-center gap-md bg-background px-2 active:bg-white/5">
          <Checkbox checked={checked} />
          <Label item={item} checked={checked} takenBy={takenBy} />
        </Pressable>
      </ReanimatedSwipeable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 24,
    height: 24,
    borderRadius: 9999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strike: {
    position: 'absolute',
    left: 0,
    top: '50%',
    height: 1.5,
    marginTop: -0.75,
    backgroundColor: colors.onSurfaceVariant,
  },
  action: {
    width: ACTION_WIDTH,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
});

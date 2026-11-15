import { Easing, FadeInDown, FadeOutLeft, FadeOutUp, LinearTransition } from 'react-native-reanimated';

// One motion vocabulary so every list in the app moves the same way.
// Springs for anything that changes position; TIMING_FAST only for
// opacity / colour. Never put a layout animation and a useAnimatedStyle
// transform on the same node (see components/BottomSheet.tsx).

/** Rows settling into a new position. */
export const SPRING_SNAPPY = { damping: 18, stiffness: 220, mass: 0.8 } as const;
/** Checkbox pop. */
export const SPRING_POP = { damping: 12, stiffness: 320, mass: 0.6 } as const;
/** Opacity / colour fades. */
export const TIMING_FAST = { duration: 160, easing: Easing.out(Easing.cubic) } as const;

/** `layout=` for every row whose list can change membership. */
export const rowLayout = LinearTransition.springify()
  .damping(SPRING_SNAPPY.damping)
  .stiffness(SPRING_SNAPPY.stiffness)
  .mass(SPRING_SNAPPY.mass);
export const rowEntering = FadeInDown.duration(180).springify().damping(20);
export const rowExiting = FadeOutLeft.duration(140);
export const listExiting = FadeOutUp.duration(120);

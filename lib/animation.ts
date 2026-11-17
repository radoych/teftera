import { Easing, FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

// One motion vocabulary so every list in the app moves the same way: plain
// timed fades and linear layout shifts, no springs. Never put a layout
// animation and a useAnimatedStyle transform on the same node (see
// components/BottomSheet.tsx).

/** Opacity / colour fades. */
export const TIMING_FAST = { duration: 160, easing: Easing.out(Easing.cubic) } as const;

/** `layout=` for every row whose list can change membership. */
export const rowLayout = LinearTransition.duration(200);
export const rowEntering = FadeIn.duration(150);
export const rowExiting = FadeOut.duration(150);
export const listExiting = FadeOut.duration(120);

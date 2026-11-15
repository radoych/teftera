import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Thin wrapper so screens never import expo-haptics directly. Every call is
// fire-and-forget: haptics are a nicety and must never throw or block a
// gesture (unsupported devices reject; we swallow that). No-op on web.

const isWeb = Platform.OS === 'web';
const swallow = () => {};

export const haptics = {
  /** Light impact — check-off, quick-add. */
  tap: (): void => {
    if (isWeb) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(swallow);
  },
  /** Selection tick — picks, unchecks. */
  select: (): void => {
    if (isWeb) return;
    void Haptics.selectionAsync().catch(swallow);
  },
  /** Success notification — last item taken, card scanned, list created. */
  success: (): void => {
    if (isWeb) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(swallow);
  },
  /** Error notification — a reverted optimistic write. */
  error: (): void => {
    if (isWeb) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(swallow);
  },
} as const;

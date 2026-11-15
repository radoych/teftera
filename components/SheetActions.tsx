import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { colors } from '@/lib/theme';

type Variant = 'filled' | 'ghost' | 'destructive';

const VARIANTS: Record<Variant, { container: string; content: string }> = {
  filled: { container: 'bg-primary-container', content: colors.onPrimary },
  ghost: { container: 'border border-white/10 active:bg-white/5', content: colors.onSurface },
  destructive: { container: 'bg-error-container', content: colors.error },
};

export interface SheetAction {
  label: string;
  onPress: () => void;
  /** 'filled' = primary accent, 'ghost' = outlined (default), 'destructive' = error. */
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
}

interface SheetActionsProps {
  actions: SheetAction[];
}

/**
 * Pill action row for bottom sheets. One action renders centered; two or more
 * render side-by-side at equal width (first listed = left-most). Mirrors the
 * FloatingActionBar single-vs-multiple convention so in-sheet and floating
 * actions read the same. The one place sheet button layout is decided.
 */
export function SheetActions({ actions }: SheetActionsProps) {
  const single = actions.length === 1;

  return (
    <View className={`flex-row gap-md ${single ? 'justify-center' : ''}`}>
      {actions.map((action) => {
        const v = VARIANTS[action.variant ?? 'ghost'];
        const inactive = action.disabled || action.loading;
        return (
          <Pressable
            key={action.label}
            onPress={inactive ? undefined : action.onPress}
            disabled={inactive}
            accessibilityRole="button"
            className={`items-center justify-center py-3 active:opacity-80 ${v.container} ${
              single ? 'px-8' : 'flex-1'
            } ${inactive ? 'opacity-60' : ''}`}
            style={{ borderRadius: 9999 }}>
            {action.loading ? (
              <ActivityIndicator color={v.content} />
            ) : (
              <Text
                className="font-inter-semibold text-label-md uppercase"
                style={{ color: v.content }}>
                {action.label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

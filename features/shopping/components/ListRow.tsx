// features/shopping/components/ListRow.tsx — one list on the index screen and the dashboard.
import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { rowEntering, rowExiting, rowLayout } from '@/lib/animation';
import { colors } from '@/lib/theme';
import { listMetaLabel } from '../copy';
import type { ShoppingListView } from '../types';

export interface ListRowProps {
  view: ShoppingListView;
  onPress: () => void;
  showDivider?: boolean;
}

/** Vendor name · "N за вземане" / "Готово" / "Празен" · card icon when a card is attached · chevron. */
export function ListRow({ view, onPress, showDivider = true }: ListRowProps) {
  const meta = listMetaLabel(view.counts);
  const pending = view.counts.open > 0;
  return (
    <Animated.View
      entering={rowEntering}
      exiting={rowExiting}
      layout={rowLayout}
      style={showDivider ? styles.divider : undefined}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${view.title}, ${meta}`}
        className="flex-row items-center gap-md py-md active:bg-white/5">
        <View className="flex-1 gap-0.5">
          <Text className="font-jakarta-medium text-headline-md text-on-surface" numberOfLines={1}>
            {view.title}
          </Text>
          <Text
            className={`font-inter text-label-md ${
              pending ? 'text-primary-container' : 'text-on-surface-variant opacity-60'
            }`}>
            {meta}
          </Text>
        </View>
        {view.cardNickname ? (
          <View
            accessibilityLabel={`Карта: ${view.cardNickname}`}
            className="h-8 w-8 items-center justify-center border border-white/10 bg-surface-container"
            style={{ borderRadius: 9999 }}>
            <MaterialIcons name="card-membership" size={16} color={colors.onSurfaceVariant} />
          </View>
        ) : null}
        <MaterialIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
});

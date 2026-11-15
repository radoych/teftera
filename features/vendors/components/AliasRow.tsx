// features/vendors/components/AliasRow.tsx — one recognized name with a delete action.
import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { rowEntering, rowExiting, rowLayout } from '@/lib/animation';
import { colors } from '@/lib/theme';
import type { VendorAlias } from '../types';

interface AliasRowProps {
  alias: VendorAlias;
  onDelete: (alias: VendorAlias) => void;
}

/** Animates in/out with the shared row vocabulary; a "от бележка" tag marks learned names. */
export function AliasRow({ alias, onDelete }: AliasRowProps) {
  return (
    <Animated.View
      entering={rowEntering}
      exiting={rowExiting}
      layout={rowLayout}
      style={styles.divider}>
      <View className="flex-row items-center gap-md py-md">
        <View className="flex-1 flex-row flex-wrap items-center gap-sm">
          <Text className="font-inter text-body-lg text-on-surface">{alias.alias}</Text>
          {alias.source === 'receipt' ? (
            <View
              className="border border-white/10 px-2 py-0.5"
              style={{ borderRadius: 9999 }}>
              <Text className="font-inter-medium text-label-md text-on-surface-variant">
                от бележка
              </Text>
            </View>
          ) : null}
        </View>
        <Pressable
          onPress={() => onDelete(alias)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Премахни ${alias.alias}`}
          className="p-1">
          <MaterialIcons name="delete" size={18} color={colors.error} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.05)',
  },
});

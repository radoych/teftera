import { MaterialIcons } from '@expo/vector-icons';
import { ScrollView, Pressable, Text, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import type { CategoryLite } from '@/features/transactions/groupByDay';
import type { MaterialIconName } from '@/lib/categories';
import { colors } from '@/lib/theme';

interface CategoryPickerModalProps {
  visible: boolean;
  categories: CategoryLite[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  /** When set, a first row with this label clears the choice (active when `selectedId` is null). */
  clearLabel?: string;
  onClear?: () => void;
}

/** Bottom-sheet list of the household's categories; controlled select. */
export function CategoryPickerModal({
  visible,
  categories,
  selectedId,
  onSelect,
  onClose,
  clearLabel,
  onClear,
}: CategoryPickerModalProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text className="px-6 py-3 font-jakarta-semibold text-headline-md text-on-surface">
        Категория
      </Text>
      <ScrollView className="max-h-96">
        {onClear && clearLabel ? (
          <Pressable
            onPress={onClear}
            className="flex-row items-center gap-md px-6 py-3 active:bg-white/5">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-container-high">
              <MaterialIcons name="block" size={20} color={colors.outline} />
            </View>
            <Text className="flex-1 font-inter text-body-lg text-on-surface-variant">
              {clearLabel}
            </Text>
            {selectedId === null ? (
              <MaterialIcons name="check" size={22} color={colors.primaryContainer} />
            ) : null}
          </Pressable>
        ) : null}
        {categories.map((c) => {
          const active = c.id === selectedId;
          return (
            <Pressable
              key={c.id}
              onPress={() => onSelect(c.id)}
              className="flex-row items-center gap-md px-6 py-3 active:bg-white/5">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-container-high">
                <MaterialIcons name={c.icon as MaterialIconName} size={20} color={c.color} />
              </View>
              <Text className="flex-1 font-inter text-body-lg text-on-surface">{c.name}</Text>
              {active ? (
                <MaterialIcons name="check" size={22} color={colors.primaryContainer} />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}

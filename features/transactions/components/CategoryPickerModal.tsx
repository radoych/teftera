import { MaterialIcons } from '@expo/vector-icons';
import { ScrollView, Pressable, Text, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import type { CategoryLite } from '@/features/transactions/groupByDay';
import type { MaterialIconName } from '@/lib/categories';

interface CategoryPickerModalProps {
  visible: boolean;
  categories: CategoryLite[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

/** Bottom-sheet list of the household's categories; controlled select. */
export function CategoryPickerModal({
  visible,
  categories,
  selectedId,
  onSelect,
  onClose,
}: CategoryPickerModalProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text className="px-6 py-3 font-jakarta-semibold text-headline-md text-on-surface">
        Категория
      </Text>
      <ScrollView className="max-h-96">
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
              {active ? <MaterialIcons name="check" size={22} color="#adc7ff" /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}

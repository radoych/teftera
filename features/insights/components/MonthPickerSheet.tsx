import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { SectionLabel } from '@/components/SectionLabel';
import type { MonthOption } from '@/features/reports/types';
import { colors } from '@/lib/theme';

interface MonthPickerSheetProps {
  visible: boolean;
  options: MonthOption[];
  onPick: (opt: MonthOption) => void;
  onClose: () => void;
}

/** BottomSheet used for picking a month to export a PDF report. */
export function MonthPickerSheet({
  visible,
  options,
  onPick,
  onClose,
}: MonthPickerSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View className="px-lg pb-lg pt-sm">
        <SectionLabel className="mb-md">Изтегли отчет за месец</SectionLabel>
        {options.map((opt) => (
          <Pressable
            key={opt.monthISO}
            onPress={() => onPick(opt)}
            className="flex-row items-center justify-between py-md"
          >
            <Text className="font-inter text-body-lg text-on-surface">{opt.label}</Text>
            <MaterialIcons name="picture-as-pdf" size={20} color={colors.outline} />
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

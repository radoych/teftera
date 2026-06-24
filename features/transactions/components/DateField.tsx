import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { HairlineDivider } from '@/components/HairlineDivider';
import { WheelDatePicker } from '@/features/transactions/components/WheelDatePicker';
import { relativeDay } from '@/lib/dates';

interface DateFieldProps {
  value: string; // YYYY-MM-DD
  onChange: (iso: string) => void;
  label?: string;
}

/** A "Дата" row that opens the in-app wheel date picker. */
export function DateField({ value, onChange, label = 'Дата' }: DateFieldProps) {
  const [open, setOpen] = useState(false);

  return (
    <View>
      <Pressable onPress={() => setOpen(true)} className="active:bg-white/5">
        <View className="flex-row items-center justify-between px-6 py-5">
          <View className="flex-1 gap-1">
            <Text className="font-inter-medium text-label-md uppercase text-on-surface-variant opacity-60">
              {label}
            </Text>
            <Text className="font-inter text-body-lg text-on-surface">{relativeDay(value)}</Text>
          </View>
          <MaterialIcons name="event" size={22} color="#c4c6d0" />
        </View>
      </Pressable>
      <HairlineDivider />

      <WheelDatePicker
        visible={open}
        value={value}
        onConfirm={(iso) => {
          onChange(iso);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}

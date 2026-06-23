import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HairlineDivider } from '@/components/HairlineDivider';
import { relativeDay, toISODate } from '@/lib/dates';

interface DateFieldProps {
  value: string; // YYYY-MM-DD
  onChange: (iso: string) => void;
  label?: string;
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** A "Дата" row that opens the native date picker. Defaults label to „Дата". */
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

      {open && Platform.OS === 'android' ? (
        <DateTimePicker
          value={parseISO(value)}
          mode="date"
          onChange={(event, selected) => {
            setOpen(false);
            if (event.type === 'set' && selected) onChange(toISODate(selected));
          }}
        />
      ) : null}

      {open && Platform.OS !== 'android' ? (
        <Modal visible transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <Pressable className="flex-1 justify-end bg-black/50" onPress={() => setOpen(false)}>
            <Pressable className="rounded-t-3xl bg-surface-container" onPress={() => {}}>
              <SafeAreaView edges={['bottom']}>
                <View className="flex-row justify-end px-6 py-3">
                  <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                    <Text className="font-inter-medium text-label-md text-primary-container">{'Готово'}</Text>
                  </Pressable>
                </View>
                <DateTimePicker
                  value={parseISO(value)}
                  mode="date"
                  display="spinner"
                  themeVariant="dark"
                  onChange={(_event, selected) => {
                    if (selected) onChange(toISODate(selected));
                  }}
                />
              </SafeAreaView>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

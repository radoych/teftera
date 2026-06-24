import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { clampDay, daysInMonth, isoToParts, partsToISO } from '@/features/transactions/wheelDate';

const ITEM_HEIGHT = 40;
const VISIBLE = 5; // odd; center row is the selection
const PAD = ((VISIBLE - 1) / 2) * ITEM_HEIGHT;

const MONTHS_BG = [
  'Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни',
  'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември',
];

interface WheelProps {
  items: string[];
  index: number;
  onIndexChange: (i: number) => void;
}

function Wheel({ items, index, onIndexChange }: WheelProps) {
  const ref = useRef<ScrollView>(null);

  // Keep the scroll position in sync when the selected index changes externally
  // (e.g. day re-clamped after a month change).
  useEffect(() => {
    ref.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: false });
  }, [index]);

  return (
    <View style={{ height: ITEM_HEIGHT * VISIBLE }} className="flex-1">
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: PAD }}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
          onIndexChange(Math.min(Math.max(i, 0), items.length - 1));
        }}>
        {items.map((label, i) => (
          <View key={label + i} style={{ height: ITEM_HEIGHT }} className="items-center justify-center">
            <Text
              className={`font-inter text-body-lg ${
                i === index ? 'text-on-surface' : 'text-on-surface-variant opacity-40'
              }`}>
              {label}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

interface WheelDatePickerProps {
  visible: boolean;
  value: string; // ISO YYYY-MM-DD
  onConfirm: (iso: string) => void;
  onClose: () => void;
}

/** Day / month / year scroll-wheels in a bottom sheet. */
export function WheelDatePicker({ visible, value, onConfirm, onClose }: WheelDatePickerProps) {
  const seed = isoToParts(value);
  const [year, setYear] = useState(seed.year);
  const [month, setMonth] = useState(seed.month);
  const [day, setDay] = useState(seed.day);

  // Re-seed each time the sheet opens with a (possibly new) value.
  useEffect(() => {
    if (visible) {
      const p = isoToParts(value);
      setYear(p.year);
      setMonth(p.month);
      setDay(p.day);
    }
  }, [visible, value]);

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: thisYear + 1 - 1970 + 1 }, (_, i) => 1970 + i);
  const monthCount = daysInMonth(year, month);
  const days = Array.from({ length: monthCount }, (_, i) => i + 1);
  const clampedDay = clampDay(year, month, day);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text className="px-6 py-3 font-jakarta-semibold text-headline-md text-on-surface">Дата</Text>
      <View className="flex-row px-6">
        <Wheel
          items={days.map(String)}
          index={clampedDay - 1}
          onIndexChange={(i) => setDay(i + 1)}
        />
        <Wheel items={MONTHS_BG} index={month - 1} onIndexChange={(i) => setMonth(i + 1)} />
        <Wheel
          items={years.map(String)}
          index={years.indexOf(year)}
          onIndexChange={(i) => setYear(years[i]!)}
        />
      </View>
      <View className="px-6 pb-2 pt-4">
        <Pressable
          onPress={() => onConfirm(partsToISO(year, month, clampedDay))}
          className="items-center bg-primary-container py-3 active:opacity-80"
          style={{ borderRadius: 9999 }}>
          <Text className="font-inter-semibold text-label-md uppercase" style={{ color: '#112f5e' }}>
            Готово
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

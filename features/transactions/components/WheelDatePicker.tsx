import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
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
  /** Called with the selected date when the sheet is dismissed. */
  onChange: (iso: string) => void;
  onClose: () => void;
}

/**
 * Day / month / year scroll-wheels in a bottom sheet. There is no confirm button:
 * the current wheel selection is committed via `onChange` when the sheet is
 * dismissed (scrim tap, grabber swipe, or back), then `onClose` fires.
 */
export function WheelDatePicker({ visible, value, onChange, onClose }: WheelDatePickerProps) {
  const seed = isoToParts(value);
  const [year, setYear] = useState(seed.year);
  const [month, setMonth] = useState(seed.month);
  const [day, setDay] = useState(seed.day);

  // Re-seed the wheels when the sheet (re)opens or the incoming value changes.
  // Derived during render — React's recommended alternative to setState-in-effect.
  const [synced, setSynced] = useState({ visible, value });
  if (synced.visible !== visible || synced.value !== value) {
    setSynced({ visible, value });
    if (visible) {
      setYear(seed.year);
      setMonth(seed.month);
      setDay(seed.day);
    }
  }

  const thisYear = new Date().getFullYear();
  const minYear = Math.min(1970, year);
  const maxYear = Math.max(thisYear + 1, year);
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i);
  const monthCount = daysInMonth(year, month);
  const days = Array.from({ length: monthCount }, (_, i) => i + 1);
  const clampedDay = clampDay(year, month, day);

  // Commit the current selection, then let the host close the sheet.
  const handleClose = () => {
    onChange(partsToISO(year, month, clampedDay));
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={handleClose}>
      <Text className="px-6 py-3 font-jakarta-semibold text-headline-md text-on-surface">Дата</Text>
      <View className="flex-row px-6 pb-6">
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
    </BottomSheet>
  );
}

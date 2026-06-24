import { Pressable, Text, View } from 'react-native';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedToggleProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Pill-shaped segmented control. The active segment fills with
 * `primary-container`; inactive segments are quiet `on-surface-variant`.
 * Matches the active-nav-pill treatment from the design system.
 */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
}: SegmentedToggleProps<T>) {
  return (
    <View
      className="flex-row items-center bg-surface-container p-1"
      style={{ borderRadius: 9999 }}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            className={`px-4 py-1.5 ${active ? 'bg-primary-container' : ''}`}
            style={{ borderRadius: 9999 }}>
            <Text
              className={`font-inter-semibold text-label-md ${
                active ? 'text-on-primary' : 'text-on-surface-variant'
              }`}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

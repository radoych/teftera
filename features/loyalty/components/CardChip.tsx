import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text } from 'react-native';
import { colors } from '@/lib/theme';

export interface CardChipProps {
  nickname: string;
  /** Filled `primary-container` when active (e.g. the presenter's card switcher). */
  active?: boolean;
  onPress?: () => void;
}

/** Compact pill: `card-membership` icon + nickname. For list headers and card switchers. */
export function CardChip({ nickname, active = false, onPress }: CardChipProps) {
  const content = active ? colors.onPrimary : colors.onSurfaceVariant;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? { selected: active } : undefined}
      className={`flex-row items-center gap-xs px-3 py-1.5 active:opacity-80 ${
        active ? 'bg-primary-container' : 'border border-white/10 bg-surface-container'
      }`}
      style={{ borderRadius: 9999 }}>
      <MaterialIcons name="card-membership" size={14} color={content} />
      <Text
        className="font-inter-semibold text-label-md"
        style={{ color: content }}
        numberOfLines={1}>
        {nickname}
      </Text>
    </Pressable>
  );
}

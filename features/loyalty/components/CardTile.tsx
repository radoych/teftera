import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { colors } from '@/lib/theme';
import { maskCode } from '../format';
import { NO_VENDOR_TITLE } from '../group';
import type { LoyaltyCard } from '../types';

export interface CardTileProps {
  card: Pick<LoyaltyCard, 'nickname' | 'code' | 'color'>;
  /** Vendor display name; undefined renders "Без търговец". */
  vendorName?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Fixed tile width (grid column). Defaults to the parent's layout. */
  width?: number;
}

/**
 * Card tile for grids: a flat colour-tinted block (card colour at 15 %) with the
 * vendor name in the card colour, nickname and masked code. No shadow (flat
 * design). Press → presenter, long-press → edit (wired by the caller).
 */
export function CardTile({ card, vendorName, onPress, onLongPress, width }: CardTileProps) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${vendorName ?? NO_VENDOR_TITLE}, ${card.nickname}`}
      className="rounded-2xl p-md active:opacity-80"
      style={{
        width,
        backgroundColor: `${card.color}26`,
        borderWidth: 1,
        borderColor: colors.hairline,
      }}>
      <View className="mb-md flex-row items-start justify-between gap-sm">
        <Text
          className="flex-1 font-jakarta-medium text-headline-md"
          style={{ color: card.color }}
          numberOfLines={1}>
          {vendorName ?? NO_VENDOR_TITLE}
        </Text>
        <MaterialIcons name="card-membership" size={20} color={card.color} />
      </View>
      <Text className="font-inter text-body-md text-on-surface" numberOfLines={1}>
        {card.nickname}
      </Text>
      <Text
        className="mt-xs font-inter-medium text-label-md"
        style={{ color: colors.onSurfaceVariant }}
        numberOfLines={1}>
        {maskCode(card.code)}
      </Text>
    </Pressable>
  );
}

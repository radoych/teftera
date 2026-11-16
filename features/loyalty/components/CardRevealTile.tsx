import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { Barcode } from '@/components/Barcode';
import { colors } from '@/lib/theme';
import { maskCode } from '../format';
import type { LoyaltyCard } from '../types';

/** Fixed tile height (px) — the reveal distance of the list screen. */
export const CARD_TILE_HEIGHT = 208;
/** Tile inner padding (px). */
const PADDING = 16;

export interface CardRevealTileProps {
  card: Pick<LoyaltyCard, 'nickname' | 'code' | 'code_format' | 'color'>;
  /** Tile width (px) — the barcode is laid out from it. */
  width: number;
  onPress: () => void;
}

/**
 * Large card tile revealed by the second pull on a shopping list: the card's
 * own colour as the ground, nickname, masked code and the barcode drawn
 * straight on that colour in the darkest palette token (no white box — the
 * presenter is the one white surface). Tap → full-screen presenter.
 */
export function CardRevealTile({ card, width, onPress }: CardRevealTileProps) {
  const ink = colors.surfaceContainerLowest;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Покажи картата ${card.nickname} на цял екран`}
      className="active:opacity-90"
      style={{
        width,
        height: CARD_TILE_HEIGHT,
        borderRadius: 18,
        backgroundColor: card.color,
        padding: PADDING,
      }}
    >
      <View className="flex-row items-start justify-between gap-sm">
        <View className="flex-1">
          <Text
            className="font-jakarta-bold text-headline-md"
            style={{ color: ink }}
            numberOfLines={1}
          >
            {card.nickname}
          </Text>
          <Text
            className="mt-xs font-inter-medium text-label-md"
            style={{ color: ink, opacity: 0.7 }}
            numberOfLines={1}
          >
            {maskCode(card.code)}
          </Text>
        </View>
        <MaterialIcons
          name="open-in-full"
          size={20}
          color={ink}
          style={{ opacity: 0.7 }}
        />
      </View>
      <View className="flex-1 justify-center">
        <Barcode
          value={card.code}
          format={card.code_format}
          height={72}
          width={width - PADDING * 2}
          tone={{ paper: card.color, ink }}
        />
      </View>
    </Pressable>
  );
}

// features/loyalty/components/CardPickerSheet.tsx — "Коя карта?" (spec §7.6).
import { MaterialIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { haptics } from '@/lib/haptics';
import { colors } from '@/lib/theme';
import { maskCode } from '../format';
import type { LoyaltyCard } from '../types';
import { CardChip } from './CardChip';

export interface CardPickerProps {
  cards: readonly LoyaltyCard[];
  /** The current card (check mark); undefined = no current choice. */
  selectedId?: string | null;
  /** A card id, or null for "Без карта". */
  onSelect: (cardId: string | null) => void;
  title?: string;
}

function Row({
  selected,
  onPress,
  children,
}: {
  selected: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className="min-h-14 flex-row items-center gap-md py-sm active:bg-white/5"
      style={styles.divider}>
      <View className="flex-1 flex-row items-center gap-md">{children}</View>
      <View className="w-6 items-center">
        {selected ? <MaterialIcons name="check" size={20} color={colors.primaryContainer} /> : null}
      </View>
    </Pressable>
  );
}

/**
 * The picker body without its sheet — for flows that swap it into a sheet
 * they already show (NewListSheet crossfades to it). One row per card
 * (`CardChip` + masked code), then "Без карта".
 */
export function CardPicker({ cards, selectedId, onSelect, title = 'Коя карта?' }: CardPickerProps) {
  const pick = (cardId: string | null) => {
    haptics.select();
    onSelect(cardId);
  };
  return (
    <View className="gap-md px-6 pb-4 pt-2">
      <Text className="font-jakarta-medium text-headline-md text-on-surface">{title}</Text>
      <View>
        {cards.map((card) => (
          <Row key={card.id} selected={selectedId === card.id} onPress={() => pick(card.id)}>
            <CardChip nickname={card.nickname} active={selectedId === card.id} />
            <Text className="font-inter-medium text-label-md text-on-surface-variant">
              {maskCode(card.code)}
            </Text>
          </Row>
        ))}
        <Row selected={selectedId === null} onPress={() => pick(null)}>
          <Text className="font-inter text-body-lg text-on-surface-variant">Без карта</Text>
        </Row>
      </View>
    </View>
  );
}

export interface CardPickerSheetProps extends CardPickerProps {
  visible: boolean;
  onClose: () => void;
}

/** `BottomSheet` titled "Коя карта?"; `onSelect(cardId | null)` — the caller closes it. */
export function CardPickerSheet({ visible, onClose, ...picker }: CardPickerSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <CardPicker {...picker} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
});

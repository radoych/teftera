// features/shopping/components/ListMenuSheet.tsx — Смени картата · Изчисти взетите · Изтрий списъка.
import { MaterialIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { BottomSheet } from '@/components/BottomSheet';
import { SheetActions } from '@/components/SheetActions';
import { CardPicker } from '@/features/loyalty/components/CardPickerSheet';
import type { LoyaltyCard } from '@/features/loyalty/types';
import { colors } from '@/lib/theme';
import { clearDoneTitle } from '../copy';

export interface ListMenuSheetProps {
  visible: boolean;
  onClose: () => void;
  /** List title for the delete confirmation. */
  listName: string;
  /** Taken items — "Изчисти взетите" is disabled at 0. */
  doneCount: number;
  /** The vendor's cards (the picker also offers "Без карта"). */
  cards: readonly LoyaltyCard[];
  currentCardId: string | null;
  /** Each handler runs after the sheet has been asked to close. */
  onPickCard: (cardId: string | null) => void;
  onClearDone: () => void;
  onDelete: () => void;
}

type Step = 'menu' | 'card' | 'clear' | 'delete';
type IconName = ComponentProps<typeof MaterialIcons>['name'];

function MenuRow({
  icon,
  label,
  destructive = false,
  disabled = false,
  onPress,
}: {
  icon: IconName;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const tint = destructive ? colors.error : colors.onSurface;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={`min-h-14 flex-row items-center gap-md py-sm active:bg-white/5 ${
        disabled ? 'opacity-40' : ''
      }`}
      style={styles.divider}>
      <MaterialIcons name={icon} size={22} color={destructive ? colors.error : colors.onSurfaceVariant} />
      <Text className="font-inter text-body-lg" style={{ color: tint }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Title + message + [confirm][Отказ] — ConfirmSheet's content, inside this same sheet. */
function Confirm({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <View className="gap-md">
      <Text className="font-jakarta-semibold text-headline-md text-on-surface">{title}</Text>
      {message ? (
        <Text className="font-inter text-body-md text-on-surface-variant">{message}</Text>
      ) : null}
      <SheetActions
        actions={[
          { label: confirmLabel, onPress: onConfirm, variant: 'destructive' },
          { label: 'Отказ', onPress: onCancel, variant: 'ghost' },
        ]}
      />
    </View>
  );
}

/**
 * The list's ⋮ menu. Follow-ups (card picker, confirmations) swap in as
 * content of this same sheet rather than stacking a second Modal over a
 * closing one — stacked Modals are unreliable on iOS.
 */
export function ListMenuSheet(props: ListMenuSheetProps) {
  return (
    <BottomSheet visible={props.visible} onClose={props.onClose}>
      <ListMenu {...props} />
    </BottomSheet>
  );
}

function ListMenu({
  onClose,
  listName,
  doneCount,
  cards,
  currentCardId,
  onPickCard,
  onClearDone,
  onDelete,
}: ListMenuSheetProps) {
  const [step, setStep] = useState<Step>('menu');
  const back = () => setStep('menu');

  if (step === 'card') {
    return (
      <Animated.View entering={FadeIn.duration(160)}>
        <CardPicker
          cards={cards}
          selectedId={currentCardId}
          onSelect={(cardId) => {
            onClose();
            if (cardId !== currentCardId) onPickCard(cardId);
          }}
        />
      </Animated.View>
    );
  }

  return (
    <Animated.View key={step} entering={FadeIn.duration(160)} className="px-6 pb-4 pt-2">
      {step === 'menu' ? (
        <View>
          <MenuRow icon="card-membership" label="Смени картата" onPress={() => setStep('card')} />
          <MenuRow
            icon="playlist-remove"
            label="Изчисти взетите"
            disabled={doneCount === 0}
            onPress={() => setStep('clear')}
          />
          <MenuRow
            icon="delete"
            label="Изтрий списъка"
            destructive
            onPress={() => setStep('delete')}
          />
        </View>
      ) : null}
      {step === 'clear' ? (
        <Confirm
          title={clearDoneTitle(doneCount)}
          confirmLabel="Изчисти"
          onCancel={back}
          onConfirm={() => {
            onClose();
            onClearDone();
          }}
        />
      ) : null}
      {step === 'delete' ? (
        <Confirm
          title={`Изтриване на списъка „${listName}"?`}
          message="Всички продукти в него се изтриват."
          confirmLabel="Изтрий"
          onCancel={back}
          onConfirm={() => {
            onClose();
            onDelete();
          }}
        />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
});

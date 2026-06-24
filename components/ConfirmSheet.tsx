import { Pressable, Text, View } from 'react-native';
import { BottomSheet } from './BottomSheet';

interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirm dialog as a bottom sheet with pill buttons. */
export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Отказ',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onCancel}>
      <View className="gap-md px-6 pb-4 pt-2">
        <Text className="font-jakarta-semibold text-headline-md text-on-surface">{title}</Text>
        {message ? (
          <Text className="font-inter text-body-md text-on-surface-variant">{message}</Text>
        ) : null}
        <Pressable
          onPress={onConfirm}
          className={`items-center py-3 active:opacity-80 ${
            destructive ? 'bg-error-container' : 'bg-primary-container'
          }`}
          style={{ borderRadius: 9999 }}>
          <Text
            className="font-inter-semibold text-label-md uppercase"
            style={{ color: destructive ? '#ffb4ab' : '#112f5e' }}>
            {confirmLabel}
          </Text>
        </Pressable>
        <Pressable
          onPress={onCancel}
          className="items-center border border-white/10 py-3 active:bg-white/5"
          style={{ borderRadius: 9999 }}>
          <Text className="font-inter-semibold text-label-md uppercase text-on-surface">
            {cancelLabel}
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

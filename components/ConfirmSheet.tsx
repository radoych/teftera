import { Text, View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { FloatingActionBar } from './FloatingActionBar';

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
        {/* Confirm on the left, cancel on the right — side by side. */}
        <FloatingActionBar inline
          actions={[
            { label: confirmLabel, icon: destructive ? 'delete-outline' : 'check', onPress: onConfirm, variant: destructive ? 'destructive' : 'filled' },
            { label: cancelLabel, icon: 'close', onPress: onCancel, variant: 'ghost' },
          ]}
        />
      </View>
    </BottomSheet>
  );
}

import { Text, View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { FloatingActionBar, type FloatingAction } from './FloatingActionBar';

interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Icon of the cancel pill (default `close`) — e.g. when "cancel" is a real alternative. */
  cancelIcon?: FloatingAction['icon'];
  /** Spinner on the confirm pill while its action runs. */
  confirmLoading?: boolean;
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
  cancelIcon = 'close',
  confirmLoading = false,
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
            {
              label: confirmLabel,
              icon: destructive ? 'delete-outline' : 'check',
              onPress: onConfirm,
              variant: destructive ? 'destructive' : 'filled',
              loading: confirmLoading,
            },
            { label: cancelLabel, icon: cancelIcon, onPress: onCancel, variant: 'ghost' },
          ]}
        />
      </View>
    </BottomSheet>
  );
}

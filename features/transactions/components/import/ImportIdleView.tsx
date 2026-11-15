import type { ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { EmptyState } from '@/components/EmptyState';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { Screen } from '@/components/Screen';
import type { BankConnectionInfo } from '@/features/transactions/import/useImportFlow';

interface ImportIdleViewProps {
  header: ReactNode;
  /** reading or syncing: show the spinner, hide the actions. */
  busy: boolean;
  syncing: boolean;
  online: boolean;
  needsReconnect: boolean;
  connection: BankConnectionInfo | null;
  onSync: () => void;
  onPickFile: () => void;
}

/** Before anything is loaded: sync / pick-file actions, or the read/sync spinner. */
export function ImportIdleView({
  header,
  busy,
  syncing,
  online,
  needsReconnect,
  connection,
  onSync,
  onPickFile,
}: ImportIdleViewProps) {
  return (
    <Screen
      floatingAboveTabBar={
        busy ? undefined : (
          <FloatingActionBar
            compact
            actions={[
              {
                label: needsReconnect ? 'Свържи отново' : 'Синхронизирай',
                icon: 'sync',
                variant: 'filled',
                disabled: !online,
                onPress: onSync,
              },
              { label: 'Избери CSV файл', icon: 'folder-open', variant: 'ghost', onPress: onPickFile },
            ]}
          />
        )
      }>
      {header}
      {busy ? (
        <View className="items-center py-xxl">
          <ActivityIndicator color="#adc7ff" />
          <Text className="mt-md font-inter text-body-md text-on-surface-variant opacity-70">
            {syncing ? 'Синхронизиране с банката…' : 'Обработка на файла…'}
          </Text>
        </View>
      ) : (
        <>
          <EmptyState
            icon="account-balance"
            title="Добави транзакции"
            message="Синхронизирай директно с ДСК или импортирай CSV извлечение от онлайн банкирането."
          />
          {connection ? (
            <Text className="text-center font-inter text-label-md text-on-surface-variant opacity-60">
              {`Свързано с ${connection.bankName} · валидно до ${new Date(
                connection.validUntil,
              ).toLocaleDateString('bg-BG')}`}
            </Text>
          ) : null}
        </>
      )}
    </Screen>
  );
}

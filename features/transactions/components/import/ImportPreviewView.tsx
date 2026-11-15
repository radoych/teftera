import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { Screen } from '@/components/Screen';
import { SectionLabel } from '@/components/SectionLabel';
import { TRANSACTION_WINDOW_MONTHS } from '@/features/transactions/api';
import type { ImportStatus } from '@/features/transactions/import/importFlow';
import type { ImportPreview } from '@/features/transactions/preview';
import { ImportRow } from './ImportRow';

interface ImportPreviewViewProps {
  header: ReactNode;
  preview: ImportPreview;
  status: ImportStatus;
  online: boolean;
  onSync: () => void;
  onPickFile: () => void;
  onImport: () => void;
}

/** Review screen: new expenses / income / duplicates, with re-load and import actions. */
export function ImportPreviewView({
  header,
  preview,
  status,
  online,
  onSync,
  onPickFile,
  onImport,
}: ImportPreviewViewProps) {
  const { newExpenses, newIncome, duplicates, fileName, source, truncated, outOfWindow } = preview;
  const total = newExpenses.length + newIncome.length;
  const nothing = total === 0;

  return (
    <Screen
      floatingAboveTabBar={
        <FloatingActionBar
          compact
          actions={[
            {
              label: source === 'bank' ? 'Синхронизирай пак' : 'Друг файл',
              icon: source === 'bank' ? 'sync' : 'folder-open',
              variant: 'ghost',
              loading: status === 'syncing',
              disabled: status === 'importing' || (source === 'bank' && !online),
              onPress: source === 'bank' ? onSync : onPickFile,
            },
            {
              label: nothing ? 'Няма нови' : `Импортирай ${total}`,
              icon: 'check',
              variant: 'filled',
              disabled: nothing || status === 'syncing' || !online,
              loading: status === 'importing',
              onPress: onImport,
            },
          ]}
        />
      }>
      {header}

      <Text className="mb-lg font-inter text-body-md text-on-surface-variant opacity-70">
        {fileName}
      </Text>

      {outOfWindow ? (
        <Text className="mb-md font-inter text-body-md text-tertiary">
          {`Файлът съдържа редове отпреди ${TRANSACTION_WINDOW_MONTHS} месеца — те не се проверяват за дубликати.`}
        </Text>
      ) : null}

      {truncated ? (
        <Text className="mb-md font-inter text-body-md text-tertiary">
          Банката върна непълен резултат — синхронизирай пак за останалите.
        </Text>
      ) : null}

      {newExpenses.length > 0 ? (
        <View className="mb-lg">
          <SectionLabel className="mb-sm">Нови разходи ({newExpenses.length})</SectionLabel>
          {newExpenses.map((r, i) => (
            <ImportRow key={`exp-${i}`} row={r} />
          ))}
        </View>
      ) : null}

      {newIncome.length > 0 ? (
        <View className="mb-lg">
          <SectionLabel className="mb-sm">Приходи ({newIncome.length})</SectionLabel>
          {newIncome.map((r, i) => (
            <ImportRow key={`inc-${i}`} row={r} badge="приход" />
          ))}
        </View>
      ) : null}

      {duplicates.length > 0 ? (
        <View className="mb-lg">
          <SectionLabel className="mb-sm">Дубликати ({duplicates.length})</SectionLabel>
          {duplicates.map((r, i) => (
            <ImportRow key={`dup-${i}`} row={r} muted badge="дубликат" />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

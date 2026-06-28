import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { EmptyState } from '@/components/EmptyState';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { Screen } from '@/components/Screen';
import { SectionLabel } from '@/components/SectionLabel';
import { TransactionRow } from '@/features/transactions/components/TransactionRow';
import { reasonByTxId } from '@/features/anomalies/reasons';
import { groupTransactionsByDay } from '@/features/transactions/groupByDay';
import { useTransactionsStore } from '@/features/transactions/store';
import { lastDskSyncAt, formatLastSync } from '@/features/transactions/lastSync';

export default function HistoryScreen() {
  const transactions = useTransactionsStore((s) => s.transactions);
  const categories = useTransactionsStore((s) => s.categories);
  const openAnomalies = useTransactionsStore((s) => s.openAnomalies);
  const loading = useTransactionsStore((s) => s.loading);
  const loaded = useTransactionsStore((s) => s.loaded);

  const reasons = useMemo(() => reasonByTxId(openAnomalies), [openAnomalies]);

  const groups = useMemo(
    () => groupTransactionsByDay(transactions, categories, undefined, reasons),
    [transactions, categories, reasons],
  );

  const lastSyncLabel = useMemo(() => {
    const iso = lastDskSyncAt(transactions);
    if (iso === null) return null;
    return formatLastSync(iso);
  }, [transactions]);

  return (
    <Screen
      withTabBar
      floatingAboveTabBar={
        <FloatingActionBar
          actions={[
            { label: 'Филтри', icon: 'tune', variant: 'ghost' },
            { label: 'Търси', icon: 'search', variant: 'filled' },
          ]}
        />
      }>
      <Text className="mb-xl mt-md font-jakarta-semibold text-headline-xl text-on-surface">
        История
      </Text>

      {lastSyncLabel !== null && (
        <Text className="mb-lg -mt-lg font-inter text-body-md text-on-surface-variant opacity-70">
          Последна синхронизация с DSK: {lastSyncLabel}
        </Text>
      )}

      {loading && !loaded ? (
        <View className="mt-xxl items-center">
          <ActivityIndicator color="#adc7ff" />
        </View>
      ) : groups.length === 0 ? (
        <EmptyState
          icon="receipt-long"
          title="Все още няма транзакции"
          message={'Добави първата с „Ръчно" или „Сканирай".'}
          cta={{ label: 'Ръчно', onPress: () => router.navigate('/manual-entry') }}
        />
      ) : (
        groups.map((group) => (
          <View key={group.label} className="mt-lg">
            <SectionLabel className="mb-sm">{group.label}</SectionLabel>
            {group.items.map((tx, i) => (
              <TransactionRow
                key={tx.id}
                tx={tx}
                onPress={() => router.navigate(`/transaction/${tx.id}`)}
                showDivider={i < group.items.length - 1}
              />
            ))}
          </View>
        ))
      )}
    </Screen>
  );
}

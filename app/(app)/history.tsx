import { useMemo } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { Screen } from '@/components/Screen';
import { SectionLabel } from '@/components/SectionLabel';
import { TransactionRow } from '@/features/transactions/components/TransactionRow';
import { groupTransactionsByDay } from '@/features/transactions/groupByDay';
import { useTransactionsStore } from '@/features/transactions/store';

export default function HistoryScreen() {
  const transactions = useTransactionsStore((s) => s.transactions);
  const categories = useTransactionsStore((s) => s.categories);
  const loading = useTransactionsStore((s) => s.loading);
  const loaded = useTransactionsStore((s) => s.loaded);

  const groups = useMemo(
    () => groupTransactionsByDay(transactions, categories),
    [transactions, categories],
  );

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

      {loading && !loaded ? (
        <View className="mt-xxl items-center">
          <ActivityIndicator color="#adc7ff" />
        </View>
      ) : groups.length === 0 ? (
        <View className="mt-xxl items-center px-6">
          <Text className="text-center font-inter text-body-lg text-on-surface-variant opacity-60">
            {'Все още няма транзакции. Добави първата с „Ръчно" или „Сканирай".'}
          </Text>
        </View>
      ) : (
        groups.map((group) => (
          <View key={group.label} className="mt-lg">
            <SectionLabel className="mb-sm">{group.label}</SectionLabel>
            {group.items.map((tx, i) => (
              <TransactionRow key={tx.id} tx={tx} showDivider={i < group.items.length - 1} />
            ))}
          </View>
        ))
      )}
    </Screen>
  );
}

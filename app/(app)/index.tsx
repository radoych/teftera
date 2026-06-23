import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { EmptyState } from '@/components/EmptyState';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { Screen } from '@/components/Screen';
import { SectionLabel } from '@/components/SectionLabel';
import { TransactionRow } from '@/features/transactions/components/TransactionRow';
import { monthTotalCents, toTransactionView } from '@/features/transactions/groupByDay';
import { useTransactionsStore } from '@/features/transactions/store';
import { formatCurrency } from '@/lib/formatCurrency';

export default function DashboardScreen() {
  const transactions = useTransactionsStore((s) => s.transactions);
  const categories = useTransactionsStore((s) => s.categories);
  const loaded = useTransactionsStore((s) => s.loaded);

  const total = useMemo(() => monthTotalCents(transactions), [transactions]);
  const recent = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    return transactions.slice(0, 5).map((tx) => toTransactionView(tx, byId));
  }, [transactions, categories]);

  return (
    <Screen
      withTabBar
      floatingAboveTabBar={
        <FloatingActionBar
          actions={[
            {
              label: 'Ръчно',
              icon: 'add',
              variant: 'ghost',
              onPress: () => router.navigate('/manual-entry'),
            },
            {
              label: 'Сканирай',
              icon: 'photo-camera',
              variant: 'filled',
              onPress: () => router.navigate('/scanner'),
            },
          ]}
        />
      }>
      {/* Top app bar */}
      <View className="mb-xl mt-md">
        <Text className="font-jakarta-bold text-headline-xl text-primary">Teftera</Text>
      </View>

      {/* Hero spending */}
      <View className="items-center py-xl">
        <SectionLabel>Месец</SectionLabel>
        {loaded ? (
          <Text
            className="mt-sm font-jakarta-semibold text-on-surface"
            style={{ fontSize: 80, lineHeight: 88 }}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}>
            {formatCurrency(total)}
          </Text>
        ) : (
          <View className="mt-lg h-20 justify-center">
            <ActivityIndicator color="#adc7ff" />
          </View>
        )}
      </View>

      {/* Recent entries */}
      <View className="mb-md flex-row items-center justify-between">
        <SectionLabel>Последни</SectionLabel>
        <Pressable
          onPress={() => router.navigate('/(app)/history')}
          className="flex-row items-center gap-1">
          <Text className="font-inter-semibold text-label-md text-primary">Виж всички</Text>
          <MaterialIcons name="chevron-right" size={16} color="#d8e3ff" />
        </Pressable>
      </View>

      {loaded && recent.length === 0 ? (
        <EmptyState icon="receipt-long" title="Все още няма транзакции" />
      ) : (
        recent.map((tx, i) => (
          <TransactionRow
            key={tx.id}
            tx={tx}
            onPress={() => router.navigate(`/transaction/${tx.id}`)}
            showDivider={i < recent.length - 1}
          />
        ))
      )}
    </Screen>
  );
}

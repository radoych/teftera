import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Comparison } from '@/components/Comparison';
import { EmptyState } from '@/components/EmptyState';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { Screen } from '@/components/Screen';
import { SectionLabel } from '@/components/SectionLabel';
import { SegmentedToggle } from '@/components/SegmentedToggle';
import { useAuthStore } from '@/features/auth/store';
import { usePreferencesStore } from '@/features/preferences/store';
import { TransactionRow } from '@/features/transactions/components/TransactionRow';
import {
  dayTotalCents,
  filterByUser,
  pctChange,
  prevMonthTotalCents,
  spendingByCategory,
} from '@/features/transactions/dashboard';
import { reasonByTxId } from '@/features/anomalies/reasons';
import { monthTotalCents, toTransactionView } from '@/features/transactions/groupByDay';
import { useTransactionsStore } from '@/features/transactions/store';
import { refreshTransactions } from '@/features/transactions/sync';
import { formatCurrency } from '@/lib/formatCurrency';

type Timeframe = 'day' | 'month';
type Scope = 'me' | 'household';

function yesterday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
}

export default function DashboardScreen() {
  const transactions = useTransactionsStore((s) => s.transactions);
  const categories = useTransactionsStore((s) => s.categories);
  const openAnomalies = useTransactionsStore((s) => s.openAnomalies);
  const loaded = useTransactionsStore((s) => s.loaded);
  const householdId = useAuthStore((s) => s.householdId);
  const userId = useAuthStore((s) => s.session?.user.id ?? null);

  const dashboardSections = usePreferencesStore((s) => s.preferences.dashboardSections);

  const [timeframe, setTimeframe] = useState<Timeframe>('month');
  const [scope, setScope] = useState<Scope>('household');
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(
    () => filterByUser(transactions, scope === 'me' ? userId : null),
    [transactions, scope, userId],
  );

  const { total, comparison } = useMemo(() => {
    const now = new Date();
    if (timeframe === 'day') {
      const today = dayTotalCents(filtered, now);
      return { total: today, comparison: pctChange(today, dayTotalCents(filtered, yesterday(now))) };
    }
    const month = monthTotalCents(filtered, now);
    return { total: month, comparison: pctChange(month, prevMonthTotalCents(filtered, now)) };
  }, [filtered, timeframe]);

  const categoryRows = useMemo(
    () => spendingByCategory(filtered, categories),
    [filtered, categories],
  );

  const reasons = useMemo(() => reasonByTxId(openAnomalies), [openAnomalies]);

  const recent = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    return filtered.slice(0, 3).map((tx) => toTransactionView(tx, byId, undefined, reasons));
  }, [filtered, categories, reasons]);

  const onRefresh = async () => {
    if (!householdId) return;
    setRefreshing(true);
    try {
      await refreshTransactions(householdId);
    } finally {
      setRefreshing(false);
    }
  };

  const comparisonLabel = timeframe === 'day' ? 'спрямо вчера' : 'спрямо миналия месец';

  const categoriesSection: ReactNode =
    loaded && categoryRows.length > 0 ? (
      <View className="mb-xl">
        <SectionLabel className="mb-md">По категория</SectionLabel>
        {categoryRows.map((row) => (
          <View key={row.id} className="py-sm">
            <View className="mb-2 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <MaterialIcons name={row.icon} size={16} color={row.color} />
                <Text className="font-inter text-body-md text-on-surface">{row.name}</Text>
              </View>
              <Text className="font-inter-semibold text-body-md text-on-surface">
                {formatCurrency(row.totalCents)}
              </Text>
            </View>
            <View
              className="h-1.5 overflow-hidden bg-surface-container"
              style={{ borderRadius: 9999 }}>
              <View
                className="h-full"
                style={{
                  width: `${Math.max(row.fraction * 100, 2)}%`,
                  backgroundColor: row.color,
                  borderRadius: 9999,
                }}
              />
            </View>
          </View>
        ))}
      </View>
    ) : null;

  const recentSection: ReactNode = (
    <View>
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
    </View>
  );

  const sectionContent: Record<'categories' | 'recent', ReactNode> = {
    categories: categoriesSection,
    recent: recentSection,
  };

  return (
    <Screen
      withTabBar
      refreshing={refreshing}
      onRefresh={onRefresh}
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
      <View className="mb-lg mt-md">
        <Text className="font-jakarta-bold text-headline-xl text-primary">Teftera</Text>
      </View>

      {/* Hero spending */}
      <View className="items-center gap-md py-lg">
        <SegmentedToggle<Timeframe>
          value={timeframe}
          onChange={setTimeframe}
          options={[
            { value: 'day', label: 'Ден' },
            { value: 'month', label: 'Месец' },
          ]}
        />
        {loaded ? (
          <Text
            className="font-jakarta-semibold text-on-surface"
            style={{ fontSize: 80, lineHeight: 88 }}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}>
            {formatCurrency(total)}
          </Text>
        ) : (
          <View className="h-20 justify-center">
            <ActivityIndicator color="#adc7ff" />
          </View>
        )}
        {loaded ? <Comparison pct={comparison} label={comparisonLabel} /> : null}
      </View>

      {/* Whose spending */}
      <View className="mb-lg items-center">
        <SegmentedToggle<Scope>
          value={scope}
          onChange={setScope}
          options={[
            { value: 'me', label: 'Аз' },
            { value: 'household', label: 'Домакинство' },
          ]}
        />
      </View>

      {/* Configurable sections rendered in user-preference order */}
      {dashboardSections
        .filter((s) => s.visible)
        .map((s) =>
          sectionContent[s.key] ? <View key={s.key}>{sectionContent[s.key]}</View> : null,
        )}
    </Screen>
  );
}

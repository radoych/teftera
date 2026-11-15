import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Comparison } from '@/components/Comparison';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { SegmentedToggle } from '@/components/SegmentedToggle';
import { Skeleton } from '@/components/Skeleton';
import { markReviewed } from '@/features/anomalies/api';
import { useAuthStore } from '@/features/auth/store';
import { AiSummaryCard } from '@/features/insights/components/AiSummaryCard';
import { AnomalyCards } from '@/features/insights/components/AnomalyCards';
import { BudgetSection } from '@/features/insights/components/BudgetSection';
import { CategoryBreakdownList } from '@/features/insights/components/CategoryBreakdownList';
import { MonthlyTrendBars } from '@/features/insights/components/MonthlyTrendBars';
import { MonthPickerSheet } from '@/features/insights/components/MonthPickerSheet';
import { TopMerchantsList } from '@/features/insights/components/TopMerchantsList';
import { refreshSummary } from '@/features/insights/summary';
import { useSummaryStore } from '@/features/insights/summaryStore';
import type { InsightsScope } from '@/features/insights/deriveInsights';
import type { TimeRange } from '@/features/insights/range';
import { useInsightsData } from '@/features/insights/useInsightsData';
import { expensesOnly } from '@/features/transactions/kind';
import { useTransactionsStore } from '@/features/transactions/store';
import { refreshTransactions } from '@/features/transactions/sync';
import { useBudgetsStore } from '@/features/budgets/store';
import { exportMonthlyReport, EmptyMonthError } from '@/features/reports/export';
import { monthPickerOptions } from '@/features/reports/reportData';
import type { MonthOption } from '@/features/reports/types';
import { formatCurrency } from '@/lib/formatCurrency';

export default function InsightsScreen() {
  const transactions = useTransactionsStore((s) => s.transactions);
  const categories = useTransactionsStore((s) => s.categories);
  const loaded = useTransactionsStore((s) => s.loaded);
  const loading = useTransactionsStore((s) => s.loading);
  const householdId = useAuthStore((s) => s.householdId);

  const summaryStatus = useSummaryStore((s) => s.status);
  const summaryText = useSummaryStore((s) => s.text);
  const [refreshing, setRefreshing] = useState(false);

  const [range, setRange] = useState<TimeRange>('this_month');
  const [scope, setScope] = useState<InsightsScope>('household');

  const [pickerVisible, setPickerVisible] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [now, setNow] = useState(() => new Date());
  useFocusEffect(useCallback(() => setNow(new Date()), []));
  const monthOptions = useMemo(() => monthPickerOptions(now), [now]);

  const onPickMonth = async (opt: MonthOption) => {
    setPickerVisible(false);
    setExporting(true);
    try {
      const s = useTransactionsStore.getState();
      await exportMonthlyReport({
        transactions: s.transactions,
        categories: s.categories,
        budgetRows: useBudgetsStore.getState().rows,
        openAnomalies: s.openAnomalies,
        month: opt.date,
        now,
        aiSummaryText: useSummaryStore.getState().text,
      });
    } catch (e) {
      if (e instanceof EmptyMonthError) {
        Alert.alert('Няма данни', 'Няма транзакции за този месец.');
      } else {
        console.error('[reports] PDF export failed:', e);
        Alert.alert(
          'Грешка',
          __DEV__
            ? `Неуспешно генериране на PDF.\n\n${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`
            : 'Неуспешно генериране на PDF.',
        );
      }
    } finally {
      setExporting(false);
    }
  };

  const { hero, categoryRows, trend, merchants, budgetRows, categoryById, anomalyCards } =
    useInsightsData(range, scope, now);
  const comparisonLabel =
    range === 'this_month' ? 'спрямо миналия месец' : 'спрямо предходния период';

  const onReview = async (anomalyId: string, transactionId: string) => {
    try {
      await markReviewed(anomalyId, transactionId);
      if (householdId) await refreshTransactions(householdId);
    } catch {
      Alert.alert('Грешка', 'Неуспешно. Опитай отново.');
    }
  };

  // Generate once per session on first view with data (status leaves 'idle' after,
  // so transaction/realtime changes never re-trigger — manual refresh only).
  useEffect(() => {
    if (
      loaded &&
      transactions.length > 0 &&
      useSummaryStore.getState().status === 'idle'
    ) {
      void refreshSummary(expensesOnly(transactions), categories);
    }
  }, [loaded, transactions, categories]);

  const onRefresh = async () => {
    setNow(new Date());
    if (!householdId) return;
    setRefreshing(true);
    try {
      await refreshTransactions(householdId);
      const s = useTransactionsStore.getState();
      await refreshSummary(expensesOnly(s.transactions), s.categories);
    } finally {
      setRefreshing(false);
    }
  };

  const showSkeleton = loading && !loaded;
  const showEmpty = loaded && transactions.length === 0;

  return (
    <Screen withTabBar refreshing={refreshing} onRefresh={onRefresh}>
      <View className="mb-lg mt-md flex-row items-center justify-between">
        <Text className="font-jakarta-semibold text-headline-xl text-on-surface">
          Анализи
        </Text>
        {!showEmpty && !showSkeleton ? (
          <Pressable
            onPress={() => setPickerVisible(true)}
            disabled={exporting}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full bg-surface-container-high"
            style={{ opacity: exporting ? 0.5 : 1 }}
          >
            {exporting ? (
              <ActivityIndicator size="small" color="#adc7ff" />
            ) : (
              <MaterialIcons name="ios-share" size={20} color="#adc7ff" />
            )}
          </Pressable>
        ) : null}
      </View>

      {showSkeleton ? (
        <View className="gap-xl pt-md">
          <Skeleton height={56} width="60%" />
          <Skeleton height={120} />
          <Skeleton height={120} />
          <Skeleton height={80} />
        </View>
      ) : showEmpty ? (
        <EmptyState
          icon="insights"
          title="Няма данни за анализ"
          message="Разбивките, тенденциите и AI обобщението се попълват с всяка добавена транзакция."
        />
      ) : (
        <>
          {/* Controls */}
          <View className="mb-xl gap-md">
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <SegmentedToggle<TimeRange>
                value={range}
                onChange={setRange}
                options={[
                  { value: 'this_month', label: 'Този месец' },
                  { value: 'last_month', label: 'Минал месец' },
                  { value: 'last_3_months', label: '3 месеца' },
                  { value: 'year', label: 'Година' },
                ]}
              />
            </ScrollView>
            <View className="items-start">
              <SegmentedToggle<InsightsScope>
                value={scope}
                onChange={setScope}
                options={[
                  { value: 'me', label: 'Аз' },
                  { value: 'household', label: 'Домакинство' },
                ]}
              />
            </View>
          </View>

          {/* Hero total */}
          <View className="gap-xs">
            <Text className="font-jakarta-semibold text-headline-xl text-primary">
              {formatCurrency(hero.totalCents)}
            </Text>
            <Comparison pct={hero.comparisonPct} label={comparisonLabel} />
            {hero.incomeCents > 0 ? (
              <Text className="font-inter-semibold text-body-md text-tertiary">
                Приходи: +{formatCurrency(hero.incomeCents)}
              </Text>
            ) : null}
          </View>

          <AiSummaryCard status={summaryStatus} text={summaryText} />

          <CategoryBreakdownList rows={categoryRows} />

          <MonthlyTrendBars trend={trend} />

          <TopMerchantsList merchants={merchants} />

          <BudgetSection rows={budgetRows} categoryById={categoryById} />

          <AnomalyCards cards={anomalyCards} onReview={onReview} />
        </>
      )}

      <MonthPickerSheet
        visible={pickerVisible}
        options={monthOptions}
        onPick={onPickMonth}
        onClose={() => setPickerVisible(false)}
      />
    </Screen>
  );
}

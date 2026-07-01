import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { Comparison } from '@/components/Comparison';
import { EmptyState } from '@/components/EmptyState';
import { HairlineDivider } from '@/components/HairlineDivider';
import { Screen } from '@/components/Screen';
import { SectionLabel } from '@/components/SectionLabel';
import { SegmentedToggle } from '@/components/SegmentedToggle';
import { Skeleton } from '@/components/Skeleton';
import { markReviewed } from '@/features/anomalies/api';
import { useAuthStore } from '@/features/auth/store';
import { monthlyTrend, sumCents, topMerchants } from '@/features/insights/aggregate';
import { refreshSummary } from '@/features/insights/summary';
import { useSummaryStore } from '@/features/insights/summaryStore';
import {
  comparisonRange,
  filterByDateBounds,
  filterByRange,
  type TimeRange,
} from '@/features/insights/range';
import {
  categoryBreakdown,
  filterByUser,
  pctChange,
  spendingByCategory,
} from '@/features/transactions/dashboard';
import { useTransactionsStore } from '@/features/transactions/store';
import { refreshTransactions } from '@/features/transactions/sync';
import { useBudgetsStore } from '@/features/budgets/store';
import { resolveBudgetsForMonth } from '@/features/budgets/resolve';
import { budgetProgress } from '@/features/budgets/progress';
import { exportMonthlyReport, EmptyMonthError } from '@/features/reports/export';
import { monthPickerOptions } from '@/features/reports/reportData';
import type { MonthOption } from '@/features/reports/types';
import { formatCurrency } from '@/lib/formatCurrency';
import { firstOfMonth } from '@/lib/dates';
import type { MaterialIconName } from '@/lib/categories';

type Scope = 'me' | 'household';

export default function InsightsScreen() {
  const transactions = useTransactionsStore((s) => s.transactions);
  const categories = useTransactionsStore((s) => s.categories);
  const openAnomalies = useTransactionsStore((s) => s.openAnomalies);
  const loaded = useTransactionsStore((s) => s.loaded);
  const loading = useTransactionsStore((s) => s.loading);
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const householdId = useAuthStore((s) => s.householdId);

  const summaryStatus = useSummaryStore((s) => s.status);
  const summaryText = useSummaryStore((s) => s.text);
  const budgetRows = useBudgetsStore((s) => s.rows);
  const [refreshing, setRefreshing] = useState(false);

  const [range, setRange] = useState<TimeRange>('this_month');
  const [scope, setScope] = useState<Scope>('household');

  const [pickerVisible, setPickerVisible] = useState(false);
  const [exporting, setExporting] = useState(false);

  const now = useMemo(() => new Date(), []);
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

  const personFiltered = useMemo(
    () => filterByUser(transactions, scope === 'me' ? userId : null),
    [transactions, scope, userId],
  );
  const rangeFiltered = useMemo(
    () => filterByRange(personFiltered, range, now),
    [personFiltered, range, now],
  );

  const heroTotal = useMemo(() => sumCents(rangeFiltered), [rangeFiltered]);
  const comparison = useMemo(() => {
    const c = comparisonRange(range, now);
    return pctChange(
      heroTotal,
      sumCents(filterByDateBounds(personFiltered, c.startISO, c.endISO)),
    );
  }, [heroTotal, personFiltered, range, now]);
  const comparisonLabel =
    range === 'this_month' ? 'спрямо миналия месец' : 'спрямо предходния период';

  const categoryRows = useMemo(
    () => categoryBreakdown(rangeFiltered, categories),
    [rangeFiltered, categories],
  );
  const trend = useMemo(
    () => monthlyTrend(personFiltered, 6, now),
    [personFiltered, now],
  );
  const merchants = useMemo(() => topMerchants(rangeFiltered, 5), [rangeFiltered]);

  const anomalyCards = useMemo(() => {
    const txById = new Map(transactions.map((t) => [t.id, t]));
    return openAnomalies
      .map((a) => {
        const t = txById.get(a.transactionId);
        return t
          ? {
              id: a.id,
              transactionId: a.transactionId,
              merchant: t.merchant,
              amountCents: t.amount_eur,
              reason: a.reason,
            }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [openAnomalies, transactions]);

  // Budget vs Actual: always current-month + full household; range/person pills do NOT affect this.
  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const currentMonthHouseholdSpend = useMemo(
    () => spendingByCategory(transactions, categories),
    [transactions, categories],
  );
  const budgetSection = useMemo(
    () =>
      budgetProgress(
        resolveBudgetsForMonth(budgetRows, firstOfMonth()),
        currentMonthHouseholdSpend,
      ),
    [budgetRows, currentMonthHouseholdSpend],
  );

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
      void refreshSummary(filterByUser(transactions, null), categories);
    }
  }, [loaded, transactions, categories]);

  const onRefresh = async () => {
    if (!householdId) return;
    setRefreshing(true);
    try {
      await refreshTransactions(householdId);
      const s = useTransactionsStore.getState();
      await refreshSummary(filterByUser(s.transactions, null), s.categories);
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
          message="Добави транзакции, за да видиш разбивки и тенденции."
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
              <SegmentedToggle<Scope>
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
              {formatCurrency(heroTotal)}
            </Text>
            <Comparison pct={comparison} label={comparisonLabel} />
          </View>

          {/* AI summary — generated, session-cached; hidden on error/idle */}
          {summaryStatus === 'loading' || (summaryStatus === 'ready' && summaryText) ? (
            <View className="mt-xl flex-row gap-md">
              <View className="w-1 rounded-full bg-surface-tint opacity-30" />
              <View className="flex-1 gap-sm">
                <View className="flex-row items-center gap-sm">
                  <MaterialIcons name="auto-awesome" size={14} color="#c4c6d0" />
                  <SectionLabel>AI обобщение</SectionLabel>
                </View>
                {summaryStatus === 'loading' ? (
                  <Skeleton height={48} />
                ) : (
                  <Text className="font-inter text-body-md leading-relaxed text-on-surface-variant">
                    {summaryText}
                  </Text>
                )}
              </View>
            </View>
          ) : null}

          <HairlineDivider className="my-xl" />

          {/* Spending by category */}
          <SectionLabel className="mb-lg">Разходи по категория</SectionLabel>
          {categoryRows.length === 0 ? (
            <Text className="font-inter text-body-md text-on-surface-variant">
              Няма разходи за този период.
            </Text>
          ) : (
            <View className="gap-lg">
              {categoryRows.map((c) => (
                <View key={c.id} className="gap-sm">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-md">
                      <View
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                      <Text className="font-inter text-body-md text-on-surface">
                        {c.name}
                      </Text>
                    </View>
                    <Text className="font-inter-semibold text-data-mono text-on-surface">
                      {formatCurrency(c.totalCents)}
                    </Text>
                  </View>
                  <View className="h-1 w-full overflow-hidden rounded-full bg-surface-container-highest">
                    <View
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(c.fraction * 100, 2)}%`,
                        backgroundColor: c.color,
                      }}
                    />
                  </View>
                </View>
              ))}
            </View>
          )}

          <HairlineDivider className="my-xl" />

          {/* Monthly trend — fixed last 6 months (range pill ignored) */}
          <SectionLabel className="mb-lg">Месечна тенденция</SectionLabel>
          <View className="h-32 flex-row items-end justify-between gap-md">
            {trend.map((m) => (
              <View key={m.label} className="flex-1 items-center gap-sm">
                <View
                  className={`w-full rounded-t-sm ${m.isCurrent ? 'border-t-2 border-primary bg-primary/40' : 'bg-surface-container-highest'}`}
                  style={{ height: `${Math.max(m.fraction * 100, 2)}%` }}
                />
                <Text
                  className={`font-inter text-[10px] ${m.isCurrent ? 'text-primary' : 'text-on-surface-variant opacity-60'}`}
                >
                  {m.label}
                </Text>
              </View>
            ))}
          </View>

          <HairlineDivider className="my-xl" />

          {/* Top merchants */}
          <SectionLabel className="mb-md">Топ търговци</SectionLabel>
          {merchants.length === 0 ? (
            <Text className="font-inter text-body-md text-on-surface-variant">
              Няма търговци за този период.
            </Text>
          ) : (
            <View>
              {merchants.map((m, i) => (
                <View key={m.merchant}>
                  <View className="flex-row items-center justify-between py-md">
                    <View className="flex-row items-center gap-md">
                      <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-container-high">
                        <MaterialIcons name="store" size={20} color="#c4c6d0" />
                      </View>
                      <Text className="font-inter text-body-md text-on-surface">
                        {m.merchant}
                      </Text>
                    </View>
                    <Text className="font-inter-semibold text-data-mono text-on-surface">
                      {formatCurrency(m.totalCents)}
                    </Text>
                  </View>
                  {i < merchants.length - 1 ? <HairlineDivider /> : null}
                </View>
              ))}
            </View>
          )}

          <HairlineDivider className="my-xl" />

          {/* Budget vs Actual — fixed to current-month + household; range/person pills ignored */}
          <SectionLabel className="mb-lg">Бюджет</SectionLabel>
          {budgetSection.length === 0 ? (
            <Text className="font-inter text-body-md text-on-surface-variant">
              Задай бюджети от Профил → Управление на бюджети.
            </Text>
          ) : (
            <View className="gap-lg">
              {budgetSection.map((p) => {
                const cat = categoryById.get(p.categoryId);
                const icon = (cat?.icon ?? 'category') as MaterialIconName;
                const iconColor = cat?.color ?? '#8e909a';
                const name = cat?.name ?? 'Other';
                const barColor =
                  p.state === 'over'
                    ? '#ffb4ab'
                    : p.state === 'warning'
                      ? '#ffdfa7'
                      : '#adc7ff';
                const remaining = p.budgetCents - p.spentCents;
                return (
                  <View key={p.categoryId} className="gap-sm">
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-md">
                        <MaterialIcons name={icon} size={16} color={iconColor} />
                        <Text className="font-inter text-body-md text-on-surface">
                          {name}
                        </Text>
                      </View>
                      <Text className="font-inter-semibold text-data-mono text-on-surface">
                        {formatCurrency(p.spentCents)} / {formatCurrency(p.budgetCents)}
                      </Text>
                    </View>
                    <View
                      className="h-1.5 overflow-hidden bg-surface-container"
                      style={{ borderRadius: 9999 }}
                    >
                      <View
                        className="h-full"
                        style={{
                          width: `${Math.min(p.pct, 100)}%`,
                          backgroundColor: barColor,
                          borderRadius: 9999,
                        }}
                      />
                    </View>
                    <Text
                      className="font-inter text-label-md"
                      style={{ color: remaining < 0 ? '#ffb4ab' : '#c4c6d0' }}
                    >
                      {remaining < 0
                        ? `Над бюджета с ${formatCurrency(-remaining)}`
                        : `Остава ${formatCurrency(remaining)}`}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {anomalyCards.length > 0 ? (
            <>
              <HairlineDivider className="my-xl" />
              <SectionLabel className="mb-md">Аномалии</SectionLabel>
              <View className="gap-md">
                {anomalyCards.map((a) => (
                  <View
                    key={a.id}
                    className="flex-row items-center justify-between rounded-xl border border-secondary-fixed/20 bg-secondary-fixed/5 p-md"
                  >
                    <View className="flex-1 flex-row items-center gap-md">
                      <View className="relative">
                        <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-container-high">
                          <MaterialIcons name="warning" size={20} color="#c3f400" />
                        </View>
                        <View className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-background bg-secondary-fixed" />
                      </View>
                      <View className="flex-1">
                        <Text
                          numberOfLines={1}
                          className="font-inter-semibold text-body-md text-on-surface"
                        >
                          {a.merchant}
                        </Text>
                        <Text
                          numberOfLines={1}
                          className="font-inter text-[10px] uppercase text-secondary-fixed"
                        >
                          {a.reason}
                        </Text>
                      </View>
                    </View>
                    <View className="items-end gap-1">
                      <Text className="font-inter-semibold text-data-mono text-secondary-fixed">
                        {formatCurrency(a.amountCents)}
                      </Text>
                      <Pressable
                        onPress={() => onReview(a.id, a.transactionId)}
                        hitSlop={6}
                      >
                        <Text className="font-inter-semibold text-label-md text-primary">
                          Прегледай
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </>
      )}

      <BottomSheet visible={pickerVisible} onClose={() => setPickerVisible(false)}>
        <View className="px-lg pb-lg pt-sm">
          <SectionLabel className="mb-md">Изтегли отчет за месец</SectionLabel>
          {monthOptions.map((opt) => (
            <Pressable
              key={opt.monthISO}
              onPress={() => onPickMonth(opt)}
              className="flex-row items-center justify-between py-md"
            >
              <Text className="font-inter text-body-lg text-on-surface">{opt.label}</Text>
              <MaterialIcons name="picture-as-pdf" size={20} color="#8e909a" />
            </Pressable>
          ))}
        </View>
      </BottomSheet>
    </Screen>
  );
}

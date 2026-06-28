import { MaterialIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Comparison } from '@/components/Comparison';
import { EmptyState } from '@/components/EmptyState';
import { HairlineDivider } from '@/components/HairlineDivider';
import { Screen } from '@/components/Screen';
import { SectionLabel } from '@/components/SectionLabel';
import { SegmentedToggle } from '@/components/SegmentedToggle';
import { Skeleton } from '@/components/Skeleton';
import { useAuthStore } from '@/features/auth/store';
import { monthlyTrend, sumCents, topMerchants } from '@/features/insights/aggregate';
import {
  comparisonRange,
  filterByDateBounds,
  filterByRange,
  type TimeRange,
} from '@/features/insights/range';
import { categoryBreakdown, filterByUser, pctChange } from '@/features/transactions/dashboard';
import { useTransactionsStore } from '@/features/transactions/store';
import { formatCurrency } from '@/lib/formatCurrency';

type Scope = 'me' | 'household';

// STATIC placeholder until Day 13 wires real anomalies.
const ANOMALIES = [
  { name: 'Amazon.de', reason: 'Необичайна сума', amountCents: 45800, icon: 'warning' as const },
  { name: 'Le Bistro', reason: 'Висока честота', amountCents: 12450, icon: 'restaurant' as const },
];

export default function InsightsScreen() {
  const transactions = useTransactionsStore((s) => s.transactions);
  const categories = useTransactionsStore((s) => s.categories);
  const loaded = useTransactionsStore((s) => s.loaded);
  const loading = useTransactionsStore((s) => s.loading);
  const userId = useAuthStore((s) => s.session?.user.id ?? null);

  const [range, setRange] = useState<TimeRange>('this_month');
  const [scope, setScope] = useState<Scope>('household');

  const now = useMemo(() => new Date(), []);
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
    return pctChange(heroTotal, sumCents(filterByDateBounds(personFiltered, c.startISO, c.endISO)));
  }, [heroTotal, personFiltered, range, now]);
  const comparisonLabel = range === 'this_month' ? 'спрямо миналия месец' : 'спрямо предходния период';

  const categoryRows = useMemo(
    () => categoryBreakdown(rangeFiltered, categories),
    [rangeFiltered, categories],
  );
  const trend = useMemo(() => monthlyTrend(personFiltered, 6, now), [personFiltered, now]);
  const merchants = useMemo(() => topMerchants(rangeFiltered, 5), [rangeFiltered]);

  const showSkeleton = loading && !loaded;
  const showEmpty = loaded && transactions.length === 0;

  return (
    <Screen withTabBar>
      <Text className="mb-lg mt-md font-jakarta-semibold text-headline-xl text-on-surface">
        Анализи
      </Text>

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

          {/* AI summary — STATIC placeholder (Day 14) */}
          <View className="mt-xl flex-row gap-md">
            <View className="w-1 rounded-full bg-surface-tint opacity-30" />
            <View className="flex-1 gap-sm">
              <View className="flex-row items-center gap-sm">
                <MaterialIcons name="auto-awesome" size={14} color="#c4c6d0" />
                <SectionLabel>AI обобщение</SectionLabel>
              </View>
              <Text className="font-inter text-body-md leading-relaxed text-on-surface-variant">
                Похарчихте €340 повече от миналия месец, основно за хранене навън.
                Хранителните стоки останаха без промяна, а разходите за развлечения
                леко намаляха.
              </Text>
            </View>
          </View>

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
                      <View className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                      <Text className="font-inter text-body-md text-on-surface">{c.name}</Text>
                    </View>
                    <Text className="font-inter-semibold text-data-mono text-on-surface">
                      {formatCurrency(c.totalCents)}
                    </Text>
                  </View>
                  <View className="h-1 w-full overflow-hidden rounded-full bg-surface-container-highest">
                    <View
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(c.fraction * 100, 2)}%`, backgroundColor: c.color }}
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
                  className={`font-inter text-[10px] ${m.isCurrent ? 'text-primary' : 'text-on-surface-variant opacity-60'}`}>
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
                      <Text className="font-inter text-body-md text-on-surface">{m.merchant}</Text>
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

          {/* Anomalies — STATIC placeholder (Day 13) */}
          <SectionLabel className="mb-md">Аномалии</SectionLabel>
          <View className="gap-md">
            {ANOMALIES.map((a) => (
              <View
                key={a.name}
                className="flex-row items-center justify-between rounded-xl border border-secondary-fixed/20 bg-secondary-fixed/5 p-md">
                <View className="flex-row items-center gap-md">
                  <View className="relative">
                    <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-container-high">
                      <MaterialIcons name={a.icon} size={20} color="#c3f400" />
                    </View>
                    <View className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-background bg-secondary-fixed" />
                  </View>
                  <View>
                    <Text className="font-inter-semibold text-body-md text-on-surface">{a.name}</Text>
                    <Text className="font-inter text-[10px] uppercase text-secondary-fixed">{a.reason}</Text>
                  </View>
                </View>
                <Text className="font-inter-semibold text-data-mono text-secondary-fixed">
                  {formatCurrency(a.amountCents)}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

import { MaterialIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { EmptyState } from '@/components/EmptyState';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { HairlineDivider } from '@/components/HairlineDivider';
import { Screen } from '@/components/Screen';
import { SectionLabel } from '@/components/SectionLabel';
import { useTransactionsStore } from '@/features/transactions/store';
import { formatCurrency } from '@/lib/formatCurrency';

const CATEGORIES = [
  { name: 'Хранене & Барове', amountCents: 54200, pct: 43, color: '#d8e3ff' },
  { name: 'Хранителни стоки', amountCents: 31050, pct: 25, color: '#ffdfa7' },
  { name: 'Транспорт', amountCents: 18500, pct: 15, color: '#abd600' },
];

const TREND = [
  { label: 'ЯНУ', pct: 40 },
  { label: 'ФЕВ', pct: 60 },
  { label: 'МАР', pct: 55 },
  { label: 'АПР', pct: 85 },
  { label: 'МАЙ', pct: 70 },
  { label: 'ЮНИ', pct: 95, current: true },
];

const MERCHANTS = [
  { name: 'Kaufland', amountCents: 21045, icon: 'shopping-cart' as const },
  { name: 'Lidl', amountCents: 9520, icon: 'store' as const },
  { name: 'Starbucks', amountCents: 6480, icon: 'local-cafe' as const },
];

const ANOMALIES = [
  { name: 'Amazon.de', reason: 'Необичайна сума', amountCents: 45800, icon: 'warning' as const },
  { name: 'Le Bistro', reason: 'Висока честота', amountCents: 12450, icon: 'restaurant' as const },
];

export default function InsightsScreen() {
  const hasData = useTransactionsStore((s) => s.transactions.length > 0);

  return (
    <Screen
      withTabBar
      floatingAboveTabBar={
        <FloatingActionBar
          actions={[
            { label: 'Филтри', icon: 'filter-list', variant: 'ghost' },
            { label: 'Сравни', icon: 'compare-arrows', variant: 'filled' },
          ]}
        />
      }>
      <Text className="mb-xl mt-md font-jakarta-semibold text-headline-xl text-on-surface">
        Анализи
      </Text>

      {!hasData ? (
        <EmptyState
          icon="insights"
          title="Няма данни за анализ"
          message="Добави транзакции, за да видиш разбивки и тенденции."
        />
      ) : (
        <>
          {/* Hero total */}
          <View className="mt-md gap-xs">
            <Text className="font-jakarta-semibold text-headline-xl text-primary">
              {formatCurrency(124000)}
            </Text>
            <Text className="font-inter text-label-md text-on-surface-variant">
              <Text className="text-secondary-fixed-dim">▲ 12%</Text> спрямо миналия месец
            </Text>
          </View>

          {/* AI summary */}
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
          <View className="gap-lg">
            {CATEGORIES.map((c) => (
              <View key={c.name} className="gap-sm">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-md">
                    <View className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                    <Text className="font-inter text-body-md text-on-surface">{c.name}</Text>
                  </View>
                  <View className="items-end">
                    <Text className="font-inter-semibold text-data-mono text-on-surface">
                      {formatCurrency(c.amountCents)}
                    </Text>
                    <Text className="font-inter text-[10px] text-on-surface-variant">{c.pct}%</Text>
                  </View>
                </View>
                <View className="h-1 w-full overflow-hidden rounded-full bg-surface-container-highest">
                  <View
                    className="h-full rounded-full"
                    style={{ width: `${c.pct}%`, backgroundColor: c.color }}
                  />
                </View>
              </View>
            ))}
          </View>

          <HairlineDivider className="my-xl" />

          {/* Monthly trend */}
          <SectionLabel className="mb-lg">Месечна тенденция</SectionLabel>
          <View className="h-32 flex-row items-end justify-between gap-md">
            {TREND.map((m) => (
              <View key={m.label} className="flex-1 items-center gap-sm">
                <View
                  className={`w-full rounded-t-sm ${m.current ? 'border-t-2 border-primary bg-primary/40' : 'bg-surface-container-highest'}`}
                  style={{ height: `${m.pct}%` }}
                />
                <Text
                  className={`font-inter text-[10px] ${m.current ? 'text-primary' : 'text-on-surface-variant opacity-60'}`}>
                  {m.label}
                </Text>
              </View>
            ))}
          </View>

          <HairlineDivider className="my-xl" />

          {/* Top merchants */}
          <SectionLabel className="mb-md">Топ търговци</SectionLabel>
          <View>
            {MERCHANTS.map((m, i) => (
              <View key={m.name}>
                <View className="flex-row items-center justify-between py-md">
                  <View className="flex-row items-center gap-md">
                    <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-container-high">
                      <MaterialIcons name={m.icon} size={20} color="#c4c6d0" />
                    </View>
                    <Text className="font-inter text-body-md text-on-surface">{m.name}</Text>
                  </View>
                  <Text className="font-inter-semibold text-data-mono text-on-surface">
                    {formatCurrency(m.amountCents)}
                  </Text>
                </View>
                {i < MERCHANTS.length - 1 ? <HairlineDivider /> : null}
              </View>
            ))}
          </View>

          <HairlineDivider className="my-xl" />

          {/* Anomalies */}
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
                    <Text className="font-inter text-[10px] uppercase text-secondary-fixed">
                      {a.reason}
                    </Text>
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

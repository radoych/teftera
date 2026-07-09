import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { EmptyState } from '@/components/EmptyState';
import { FlatInput } from '@/components/FlatInput';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { Screen } from '@/components/Screen';
import { SectionLabel } from '@/components/SectionLabel';
import { SegmentedToggle } from '@/components/SegmentedToggle';
import { SheetActions } from '@/components/SheetActions';
import { TransactionRow } from '@/features/transactions/components/TransactionRow';
import { reasonByTxId } from '@/features/anomalies/reasons';
import { useAuthStore } from '@/features/auth/store';
import {
  activeFilterCount,
  filterTransactions,
  type PersonScope,
} from '@/features/transactions/filter';
import { groupTransactionsByDay } from '@/features/transactions/groupByDay';
import { useTransactionsStore } from '@/features/transactions/store';
import { lastDskSyncAt, formatLastSync } from '@/features/transactions/lastSync';

export default function HistoryScreen() {
  const transactions = useTransactionsStore((s) => s.transactions);
  const categories = useTransactionsStore((s) => s.categories);
  const openAnomalies = useTransactionsStore((s) => s.openAnomalies);
  const loading = useTransactionsStore((s) => s.loading);
  const loaded = useTransactionsStore((s) => s.loaded);
  const session = useAuthStore((s) => s.session);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [person, setPerson] = useState<PersonScope>('all');

  const reasons = useMemo(() => reasonByTxId(openAnomalies), [openAnomalies]);

  const filtered = useMemo(
    () =>
      filterTransactions(transactions, {
        query: searchOpen ? query : '',
        categoryIds,
        person,
        myUserId: session?.user.id ?? null,
      }),
    [transactions, searchOpen, query, categoryIds, person, session],
  );

  const groups = useMemo(
    () => groupTransactionsByDay(filtered, categories, undefined, reasons),
    [filtered, categories, reasons],
  );

  const lastSyncLabel = useMemo(() => {
    const iso = lastDskSyncAt(transactions);
    if (iso === null) return null;
    return formatLastSync(iso);
  }, [transactions]);

  const filterCount = activeFilterCount({ categoryIds, person });
  const searching = searchOpen && query.trim() !== '';
  const narrowed = searching || filterCount > 0;

  const toggleCategory = (id: string) =>
    setCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );

  const clearFilters = () => {
    setCategoryIds([]);
    setPerson('all');
  };

  return (
    <Screen
      withTabBar
      floatingAboveTabBar={
        <FloatingActionBar
          actions={[
            {
              label: filterCount > 0 ? `Филтри (${filterCount})` : 'Филтри',
              icon: 'tune',
              variant: filterCount > 0 ? 'filled' : 'ghost',
              onPress: () => setFilterSheetOpen(true),
            },
            {
              label: 'Търси',
              icon: searchOpen ? 'search-off' : 'search',
              variant: searchOpen ? 'ghost' : 'filled',
              onPress: () => {
                setSearchOpen((open) => {
                  if (open) setQuery('');
                  return !open;
                });
              },
            },
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

      {searchOpen ? (
        <View className="mb-lg">
          <FlatInput
            value={query}
            onChangeText={setQuery}
            placeholder="Търси по търговец или бележка"
            autoFocus
            autoCapitalize="none"
          />
        </View>
      ) : null}

      {loading && !loaded ? (
        <View className="mt-xxl items-center">
          <ActivityIndicator color="#adc7ff" />
        </View>
      ) : groups.length === 0 ? (
        narrowed ? (
          <EmptyState
            icon="search-off"
            title="Няма съвпадения"
            message="Промени търсенето или филтрите."
            cta={
              filterCount > 0
                ? { label: 'Изчисти филтрите', onPress: clearFilters }
                : undefined
            }
          />
        ) : (
          <EmptyState
            icon="receipt-long"
            title="Все още няма транзакции"
            message="Добави първата ръчно, сканирай бележка или импортирай извлечение от ДСК."
            cta={{ label: 'Добави транзакция', onPress: () => router.navigate('/manual-entry') }}
          />
        )
      ) : (
        groups.map((group) => (
          <View key={group.label} className="mt-lg">
            <SectionLabel className="mb-sm">{group.label}</SectionLabel>
            {group.items.map((item, i) => (
              <TransactionRow
                key={item.id}
                tx={item}
                onPress={() => router.navigate(`/transaction/${item.id}`)}
                showDivider={i < group.items.length - 1}
              />
            ))}
          </View>
        ))
      )}

      <BottomSheet visible={filterSheetOpen} onClose={() => setFilterSheetOpen(false)}>
        <View className="gap-lg px-6 pb-4 pt-2">
          <Text className="font-jakarta-semibold text-headline-md text-on-surface">Филтри</Text>

          <View>
            <SectionLabel className="mb-md">Категории</SectionLabel>
            <View className="flex-row flex-wrap gap-sm">
              {categories.map((c) => {
                const active = categoryIds.includes(c.id);
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => toggleCategory(c.id)}
                    className={`flex-row items-center gap-1.5 px-4 py-1.5 ${
                      active ? 'bg-primary-container' : 'bg-surface-container'
                    }`}
                    style={{ borderRadius: 9999 }}>
                    <MaterialIcons
                      name={c.icon as never}
                      size={14}
                      color={active ? '#112f5e' : '#c4c6d0'}
                    />
                    <Text
                      className={`font-inter text-label-md ${
                        active ? 'text-on-primary' : 'text-on-surface-variant'
                      }`}>
                      {c.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View>
            <SectionLabel className="mb-md">Направени от</SectionLabel>
            <View className="self-start">
              <SegmentedToggle
                options={[
                  { value: 'all', label: 'Домакинство' },
                  { value: 'me', label: 'Само аз' },
                ]}
                value={person}
                onChange={setPerson}
              />
            </View>
          </View>

          <SheetActions
            actions={[
              { label: 'Готово', onPress: () => setFilterSheetOpen(false), variant: 'filled' },
              { label: 'Изчисти', onPress: clearFilters, variant: 'ghost' },
            ]}
          />
        </View>
      </BottomSheet>
    </Screen>
  );
}

// Route-level crash fallback — keeps the rest of the nav tree alive.
export { ScreenErrorFallback as ErrorBoundary } from '@/components/ScreenErrorFallback';

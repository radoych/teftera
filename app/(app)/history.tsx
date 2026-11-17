import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  Text,
  View,
  type SectionListRenderItem,
} from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import {
  AnimatedSectionList,
  CollapsingHeaderScreen,
} from '@/components/CollapsingHeader';
import { EmptyState } from '@/components/EmptyState';
import { FlatInput } from '@/components/FlatInput';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { SectionLabel } from '@/components/SectionLabel';
import { SegmentedToggle } from '@/components/SegmentedToggle';
import { TransactionRow } from '@/features/transactions/components/TransactionRow';
import { reasonByTxId } from '@/features/anomalies/reasons';
import { useAuthStore } from '@/features/auth/store';
import {
  activeFilterCount,
  filterTransactions,
  type PersonScope,
} from '@/features/transactions/filter';
import { groupTransactionsByDay } from '@/features/transactions/groupByDay';
import { historySubtitle } from '@/features/transactions/historySubtitle';
import { useTransactionsStore } from '@/features/transactions/store';
import { refreshTransactions } from '@/features/transactions/sync';
import { lastDskSyncAt, formatLastSync } from '@/features/transactions/lastSync';
import type { TransactionView } from '@/features/transactions/types';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { colors } from '@/lib/theme';

/** Search keystrokes settle for this long before the year of rows is re-filtered. */
const SEARCH_DEBOUNCE_MS = 250;

interface DaySection {
  key: string;
  label: string;
  data: TransactionView[];
}

const keyExtractor = (item: TransactionView) => item.id;

const renderItem: SectionListRenderItem<TransactionView, DaySection> = ({
  item,
  index,
  section,
}) => (
  <TransactionRow
    tx={item}
    onPress={() => router.push(`/transaction/${item.id}`)}
    showDivider={index < section.data.length - 1}
  />
);

const renderSectionHeader = ({ section }: { section: DaySection }) => (
  <View className="mt-lg">
    <SectionLabel className="mb-sm">{section.label}</SectionLabel>
  </View>
);

export default function HistoryScreen() {
  const transactions = useTransactionsStore((s) => s.transactions);
  const categories = useTransactionsStore((s) => s.categories);
  const openAnomalies = useTransactionsStore((s) => s.openAnomalies);
  const loading = useTransactionsStore((s) => s.loading);
  const loaded = useTransactionsStore((s) => s.loaded);
  const session = useAuthStore((s) => s.session);
  const householdId = useAuthStore((s) => s.householdId);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [person, setPerson] = useState<PersonScope>('all');
  const [refreshing, setRefreshing] = useState(false);
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const myUserId = session?.user.id ?? null;

  const reasons = useMemo(() => reasonByTxId(openAnomalies), [openAnomalies]);

  const activeQuery = searchOpen ? debouncedQuery : '';

  // Filter + group keyed on the debounced query: typing no longer re-runs the
  // sort/group over the whole window on every keystroke.
  const filtered = useMemo(
    () =>
      filterTransactions(transactions, {
        query: activeQuery,
        categoryIds,
        person,
        myUserId,
      }),
    [transactions, activeQuery, categoryIds, person, myUserId],
  );

  const sections = useMemo<DaySection[]>(
    () =>
      groupTransactionsByDay(filtered, categories, undefined, reasons).map((g) => ({
        key: g.label,
        label: g.label,
        data: g.items,
      })),
    [filtered, categories, reasons],
  );

  const lastSyncLabel = useMemo(() => {
    const iso = lastDskSyncAt(transactions);
    if (iso === null) return null;
    return formatLastSync(iso);
  }, [transactions]);

  const filterCount = activeFilterCount({ categoryIds, person });
  const searching = activeQuery.trim() !== '';
  const narrowed = searching || filterCount > 0;
  const subtitle = loaded ? historySubtitle(filtered, narrowed) : null;

  const toggleCategory = (id: string) =>
    setCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );

  const clearFilters = useCallback(() => {
    setCategoryIds([]);
    setPerson('all');
  }, []);

  const onRefresh = useCallback(async () => {
    if (!householdId) return;
    setRefreshing(true);
    try {
      await refreshTransactions(householdId);
    } catch {
      // A failed refresh keeps the rows already on screen; realtime will retry.
    } finally {
      setRefreshing(false);
    }
  }, [householdId]);

  const listHeader = (
    <>
      {lastSyncLabel !== null && (
        <Text className="mb-lg font-inter text-body-md text-on-surface-variant opacity-70">
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
    </>
  );

  const listEmpty =
    loading && !loaded ? (
      <View className="mt-xxl items-center">
        <ActivityIndicator color={colors.primaryContainer} />
      </View>
    ) : narrowed ? (
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
        cta={{ label: 'Добави транзакция', onPress: () => router.push('/manual-entry') }}
      />
    );

  return (
    <CollapsingHeaderScreen
      title="История"
      subtitle={subtitle}
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
      }
    >
      {({ scrollProps, largeTitle, refreshOffset }) => (
        <>
          {/* Virtualised: only the rows near the viewport mount. Pull-to-refresh
              is the native top-of-list pull, so it works from the expanded title. */}
          <AnimatedSectionList
            {...scrollProps}
            sections={loading && !loaded ? [] : sections}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            renderSectionHeader={renderSectionHeader}
            stickySectionHeadersEnabled={false}
            ListHeaderComponent={
              <>
                {largeTitle}
                {listHeader}
              </>
            }
            ListEmptyComponent={listEmpty}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                progressViewOffset={refreshOffset}
                tintColor={colors.primaryContainer}
                colors={[colors.primaryContainer]}
                progressBackgroundColor={colors.surfaceContainer}
              />
            }
          />

          <BottomSheet
            visible={filterSheetOpen}
            onClose={() => setFilterSheetOpen(false)}
          >
            <View className="gap-lg px-6 pb-4 pt-2">
              <Text className="font-jakarta-semibold text-headline-md text-on-surface">
                Филтри
              </Text>

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
                        style={{ borderRadius: 9999 }}
                      >
                        <MaterialIcons
                          name={c.icon as never}
                          size={14}
                          color={active ? colors.onPrimary : colors.onSurfaceVariant}
                        />
                        <Text
                          className={`font-inter text-label-md ${
                            active ? 'text-on-primary' : 'text-on-surface-variant'
                          }`}
                        >
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

              <FloatingActionBar inline
                actions={[
                  {
                    label: 'Готово', icon: 'check',
                    onPress: () => setFilterSheetOpen(false),
                    variant: 'filled',
                  },
                  { label: 'Изчисти', icon: 'clear', onPress: clearFilters, variant: 'ghost' },
                ]}
              />
            </View>
          </BottomSheet>
        </>
      )}
    </CollapsingHeaderScreen>
  );
}

// Route-level crash fallback — keeps the rest of the nav tree alive.
export { ScreenErrorFallback as ErrorBoundary } from '@/components/ScreenErrorFallback';

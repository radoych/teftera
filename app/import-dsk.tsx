import { MaterialIcons } from '@expo/vector-icons';
import { File } from 'expo-file-system';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { EmptyState } from '@/components/EmptyState';
import { HairlineDivider } from '@/components/HairlineDivider';
import { Screen } from '@/components/Screen';
import { SectionLabel } from '@/components/SectionLabel';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { useAuthStore } from '@/features/auth/store';
import { bulkInsertImported, type ImportedTransaction } from '@/features/transactions/api';
import { dedupeImport } from '@/features/transactions/dedup';
import { useTransactionsStore } from '@/features/transactions/store';
import { refreshTransactions } from '@/features/transactions/sync';
import {
  ConsentExpiredError,
  NotConnectedError,
  RateLimitedError,
  fetchBankTransactions,
  getBankConnection,
  normalizeEbTransaction,
  startBankSync,
} from '@/services/bank-sync';
import { normalizeDskRow, parseDskCsv, type NormalizedTransaction } from '@/services/dsk-import';
import { resolveCategoryId } from '@/lib/categories';
import { formatCurrency } from '@/lib/formatCurrency';
import { useIsOnline } from '@/lib/useIsOnline';

interface Preview {
  toImport: NormalizedTransaction[];
  duplicates: NormalizedTransaction[];
  income: NormalizedTransaction[];
  fileName: string;
  source: 'csv' | 'bank';
}

type Status = 'idle' | 'reading' | 'syncing' | 'ready' | 'importing' | 'done';

interface ImportSummary {
  imported: number;
  duplicates: number;
  other: number;
}

function Header() {
  return (
    <View className="mb-md flex-row items-center gap-3 py-2">
      <Pressable onPress={() => router.back()} hitSlop={8} className="-ml-2 p-2">
        <MaterialIcons name="arrow-back" size={24} color="#e3e2e6" />
      </Pressable>
      <Text className="font-jakarta-semibold text-headline-lg-mobile text-on-surface">
        Импортиране от DSK
      </Text>
    </View>
  );
}

function Row({ row, muted, badge }: { row: NormalizedTransaction; muted?: boolean; badge?: string }) {
  return (
    <View>
      <View className={`flex-row items-center justify-between py-md ${muted ? 'opacity-45' : ''}`}>
        <View className="flex-1 pr-3">
          <Text numberOfLines={1} className="font-inter text-body-lg text-on-surface">
            {row.merchant || 'Без търговец'}
          </Text>
          <Text className="font-inter text-label-md text-on-surface-variant opacity-60">
            {row.date} · {row.categoryGuess}
            {row.originalCurrency === 'BGN'
              ? ` · от ${formatCurrency(row.originalAmountCents ?? 0, 'BGN')}`
              : ''}
          </Text>
        </View>
        <View className="items-end gap-1">
          <Text className="font-inter-semibold text-body-lg text-on-surface">
            {formatCurrency(row.amountEurCents)}
          </Text>
          {badge ? (
            <Text className="font-inter-semibold text-[10px] uppercase text-on-surface-variant">
              {badge}
            </Text>
          ) : null}
        </View>
      </View>
      <HairlineDivider />
    </View>
  );
}

export default function ImportDskScreen() {
  const online = useIsOnline();
  const [status, setStatus] = useState<Status>('idle');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [connection, setConnection] = useState<{ bankName: string; validUntil: string } | null>(
    null,
  );
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const transactions = useTransactionsStore((s) => s.transactions);
  const categories = useTransactionsStore((s) => s.categories);
  const householdId = useAuthStore((s) => s.householdId);

  useEffect(() => {
    if (!householdId) return;
    getBankConnection(householdId).then(setConnection).catch(() => {});
  }, [householdId]);

  const pickAndParse = async () => {
    if (status === 'reading' || status === 'syncing') return;
    try {
      // Pick via expo-file-system's own picker: it returns a module-owned File
      // that is readable in Expo Go, unlike an external DocumentPicker cache URI
      // (which Android scoped storage rejects for read).
      const result = await File.pickFileAsync({
        mimeTypes: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel'],
      });
      if (result.canceled) return;

      const file = result.result;
      setStatus('reading');
      const text = await file.text();

      const rows = parseDskCsv(text).map(normalizeDskRow);
      const expenses = rows.filter((r) => r.kind === 'expense');
      const income = rows.filter((r) => r.kind === 'income');
      const { toImport, duplicates } = dedupeImport(expenses, transactions);

      setPreview({ toImport, duplicates, income, fileName: file.name, source: 'csv' });
      setStatus('ready');
    } catch (err) {
      if (__DEV__) console.warn('[dsk-import] parse failed', err);
      setStatus('idle');
      Alert.alert('Грешка', 'Файлът не можа да бъде прочетен. Опитай с друг CSV.');
    }
  };

  const runConsentFlow = async (): Promise<boolean> => {
    const returnUrl = Linking.createURL('bank-sync'); // teftera://bank-sync (dev client) or exp://…/--/bank-sync (Expo Go)
    const authUrl = await startBankSync(returnUrl);
    const result = await WebBrowser.openAuthSessionAsync(authUrl, returnUrl);
    if (result.type !== 'success') return false;
    const { queryParams } = Linking.parse(result.url);
    return queryParams?.status === 'ok';
  };

  const syncFromBank = async () => {
    if (status === 'syncing') return;
    setStatus('syncing');
    try {
      let ebRows;
      try {
        ebRows = await fetchBankTransactions();
      } catch (err) {
        if (err instanceof NotConnectedError || err instanceof ConsentExpiredError) {
          const consented = await runConsentFlow();
          if (!consented) {
            setStatus('idle');
            setNeedsReconnect(err instanceof ConsentExpiredError);
            Alert.alert('Синхронизация', 'Свързването с банката не беше завършено.');
            return;
          }
          setNeedsReconnect(false);
          if (householdId) getBankConnection(householdId).then(setConnection).catch(() => {});
          ebRows = await fetchBankTransactions();
        } else {
          throw err;
        }
      }

      const rows = ebRows
        .map(normalizeEbTransaction)
        .filter((r): r is NonNullable<typeof r> => r !== null);
      const expenses = rows.filter((r) => r.kind === 'expense');
      const income = rows.filter((r) => r.kind === 'income');
      const { toImport, duplicates } = dedupeImport(expenses, transactions);

      setPreview({ toImport, duplicates, income, fileName: 'Синхронизация с ДСК', source: 'bank' });
      setStatus('ready');
    } catch (err) {
      if (__DEV__) console.warn('[bank-sync] failed', err);
      setStatus('idle');
      if (err instanceof RateLimitedError) {
        Alert.alert('Синхронизация', 'Лимитът на банката е достигнат — опитай по-късно.');
      } else if (err instanceof ConsentExpiredError) {
        setNeedsReconnect(true);
        Alert.alert('Синхронизация', 'Достъпът до банката е изтекъл. Свържи се отново.');
      } else {
        Alert.alert('Грешка', 'Синхронизацията не успя. Опитай отново.');
      }
    }
  };

  const onImport = async () => {
    if (!preview || preview.toImport.length === 0 || status === 'importing' || status === 'syncing')
      return;
    const { householdId, session } = useAuthStore.getState();
    if (!householdId) {
      Alert.alert('Грешка', 'Няма активно домакинство.');
      return;
    }
    setStatus('importing');
    try {
      const rows: ImportedTransaction[] = preview.toImport.map((r) => ({
        householdId,
        userId: session?.user.id ?? null,
        amountCents: r.amountEurCents,
        originalAmountCents: r.originalAmountCents,
        originalCurrency: r.originalCurrency,
        merchant: r.merchant,
        categoryId: resolveCategoryId(r.merchant, categories),
        date: r.date,
        occurredAt: r.occurredAt,
        note: null,
      }));
      await bulkInsertImported(rows);
      await refreshTransactions(householdId);
      setSummary({
        imported: preview.toImport.length,
        duplicates: preview.duplicates.length,
        other: preview.toImport.filter((r) => r.categoryGuess === 'Other').length,
      });
      setStatus('done');
    } catch {
      setStatus('ready');
      Alert.alert('Грешка', 'Импортирането не успя. Опитай отново.');
    }
  };

  // Post-import summary
  if (status === 'done' && summary) {
    return (
      <Screen
        floatingAboveTabBar={
          <FloatingActionBar
            compact
            actions={[{ label: 'Готово', icon: 'check', variant: 'filled', onPress: () => router.back() }]}
          />
        }>
        <Header />
        <SectionLabel className="mb-lg">Резултат от импорта</SectionLabel>
        <View className="gap-4">
          <View className="flex-row items-center justify-between py-md">
            <Text className="font-inter text-body-lg text-on-surface">Импортирани</Text>
            <Text className="font-inter-semibold text-body-lg text-on-surface">{summary.imported}</Text>
          </View>
          <HairlineDivider />
          <View className="flex-row items-center justify-between py-md">
            <Text className="font-inter text-body-lg text-on-surface-variant opacity-70">
              Пропуснати дубликати
            </Text>
            <Text className="font-inter-semibold text-body-lg text-on-surface-variant opacity-70">
              {summary.duplicates}
            </Text>
          </View>
          <HairlineDivider />
          <View className="flex-row items-center justify-between py-md">
            <Text className="font-inter text-body-lg text-on-surface-variant opacity-70">
              {`В категория „Други"`}
            </Text>
            <Text className="font-inter-semibold text-body-lg text-on-surface-variant opacity-70">
              {summary.other}
            </Text>
          </View>
          <HairlineDivider />
        </View>
      </Screen>
    );
  }

  // Initial / reading / syncing states
  if (!preview) {
    const busy = status === 'reading' || status === 'syncing';
    return (
      <Screen
        floatingAboveTabBar={
          busy ? undefined : (
            <FloatingActionBar
              compact
              actions={[
                {
                  label: needsReconnect ? 'Свържи отново' : 'Синхронизирай',
                  icon: 'sync',
                  variant: 'filled',
                  disabled: !online,
                  onPress: syncFromBank,
                },
                { label: 'Избери CSV файл', icon: 'folder-open', variant: 'ghost', onPress: pickAndParse },
              ]}
            />
          )
        }>
        <Header />
        {busy ? (
          <View className="items-center py-xxl">
            <ActivityIndicator color="#adc7ff" />
            <Text className="mt-md font-inter text-body-md text-on-surface-variant opacity-70">
              {status === 'syncing' ? 'Синхронизиране с банката…' : 'Обработка на файла…'}
            </Text>
          </View>
        ) : (
          <>
            <EmptyState
              icon="account-balance"
              title="Добави транзакции"
              message="Синхронизирай директно с ДСК или импортирай CSV извлечение от онлайн банкирането."
            />
            {connection ? (
              <Text className="text-center font-inter text-label-md text-on-surface-variant opacity-60">
                {`Свързано с ${connection.bankName} · валидно до ${new Date(
                  connection.validUntil,
                ).toLocaleDateString('bg-BG')}`}
              </Text>
            ) : null}
          </>
        )}
      </Screen>
    );
  }

  const { toImport, duplicates, income, fileName, source } = preview;
  const nothing = toImport.length === 0;

  return (
    <Screen
      floatingAboveTabBar={
        <FloatingActionBar
          compact
          actions={[
            {
              label: source === 'bank' ? 'Синхронизирай пак' : 'Друг файл',
              icon: source === 'bank' ? 'sync' : 'folder-open',
              variant: 'ghost',
              loading: status === 'syncing',
              disabled: status === 'importing' || (source === 'bank' && !online),
              onPress: source === 'bank' ? syncFromBank : pickAndParse,
            },
            {
              label: nothing ? 'Няма нови' : `Импортирай ${toImport.length}`,
              icon: 'check',
              variant: 'filled',
              disabled: nothing || status === 'syncing' || !online,
              loading: status === 'importing',
              onPress: onImport,
            },
          ]}
        />
      }>
      <Header />

      <Text className="mb-lg font-inter text-body-md text-on-surface-variant opacity-70">
        {fileName}
      </Text>

      {toImport.length > 0 ? (
        <View className="mb-lg">
          <SectionLabel className="mb-sm">Нови ({toImport.length})</SectionLabel>
          {toImport.map((r, i) => (
            <Row key={`new-${i}`} row={r} />
          ))}
        </View>
      ) : null}

      {duplicates.length > 0 ? (
        <View className="mb-lg">
          <SectionLabel className="mb-sm">Дубликати ({duplicates.length})</SectionLabel>
          {duplicates.map((r, i) => (
            <Row key={`dup-${i}`} row={r} muted badge="дубликат" />
          ))}
        </View>
      ) : null}

      {income.length > 0 ? (
        <View className="mb-lg">
          <SectionLabel className="mb-sm">Приходи — пропуснати ({income.length})</SectionLabel>
          {income.map((r, i) => (
            <Row key={`inc-${i}`} row={r} muted badge="приход" />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

// Route-level crash fallback — keeps the rest of the nav tree alive.
export { ScreenErrorFallback as ErrorBoundary } from '@/components/ScreenErrorFallback';

import { MaterialIcons } from '@expo/vector-icons';
import { File } from 'expo-file-system';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { SectionLabel } from '@/components/SectionLabel';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { useAuthStore } from '@/features/auth/store';
import { bulkInsertImported, type ImportedTransaction } from '@/features/transactions/api';
import { dedupeImport } from '@/features/transactions/dedup';
import { useTransactionsStore } from '@/features/transactions/store';
import { refreshTransactions } from '@/features/transactions/sync';
import { ImportRow } from '@/features/transactions/components/import/ImportRow';
import { ImportSummaryView } from '@/features/transactions/components/import/ImportSummaryView';
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
import { useIsOnline } from '@/lib/useIsOnline';
import { windowStartISO } from '@/lib/dates';
import { TRANSACTION_WINDOW_MONTHS } from '@/features/transactions/api';
import { expensesOnly, incomeOnly } from '@/features/transactions/kind';
import type { Transaction } from '@/features/transactions/types';

interface Preview {
  newExpenses: NormalizedTransaction[];
  newIncome: NormalizedTransaction[];
  duplicates: NormalizedTransaction[];
  fileName: string;
  source: 'csv' | 'bank';
  truncated: boolean;
  outOfWindow: boolean;
}

/** Partition freshly-parsed rows into new-expense / new-income / duplicate buckets, and flag
 * rows the dedup window can't cover (older than the fetched-transaction window). */
function buildPreview(
  rows: NormalizedTransaction[],
  existing: Transaction[],
  fileName: string,
  source: 'csv' | 'bank',
  truncated: boolean,
): Preview {
  const windowStart = windowStartISO(TRANSACTION_WINDOW_MONTHS);
  const { toImport, duplicates } = dedupeImport(rows, existing);
  return {
    newExpenses: expensesOnly(toImport),
    newIncome: incomeOnly(toImport),
    duplicates,
    fileName,
    source,
    truncated,
    outOfWindow: rows.some((r) => r.date < windowStart),
  };
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

      const rows = parseDskCsv(text)
        .map(normalizeDskRow)
        .filter((r): r is NormalizedTransaction => r !== null);

      setPreview(buildPreview(rows, transactions, file.name, 'csv', false));
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
      let ebTxs;
      let truncated: boolean;
      try {
        ({ transactions: ebTxs, truncated } = await fetchBankTransactions());
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
          ({ transactions: ebTxs, truncated } = await fetchBankTransactions());
        } else {
          throw err;
        }
      }

      const rows = ebTxs
        .map(normalizeEbTransaction)
        .filter((r): r is NonNullable<typeof r> => r !== null);

      setPreview(buildPreview(rows, transactions, 'Синхронизация с ДСК', 'bank', truncated));
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
    const total = preview ? preview.newExpenses.length + preview.newIncome.length : 0;
    if (!preview || total === 0 || status === 'importing' || status === 'syncing') return;
    const { householdId, session } = useAuthStore.getState();
    if (!householdId) {
      Alert.alert('Грешка', 'Няма активно домакинство.');
      return;
    }
    setStatus('importing');
    try {
      // Recompute dedupe against the FRESH store state — a partner may have inserted a
      // transaction between building the preview and confirming the import.
      const fresh = useTransactionsStore.getState().transactions;
      const candidates = [...preview.newExpenses, ...preview.newIncome];
      const { toImport } = dedupeImport(candidates, fresh);
      const rows: ImportedTransaction[] = toImport.map((r) => ({
        householdId,
        userId: session?.user.id ?? null,
        kind: r.kind,
        amountCents: r.amountEurCents,
        originalAmountCents: r.originalAmountCents,
        originalCurrency: r.originalCurrency,
        merchant: r.merchant,
        categoryId: resolveCategoryId(r.merchant, categories, r.kind),
        date: r.date,
        occurredAt: r.occurredAt,
        note: null,
      }));
      await bulkInsertImported(rows);
      await refreshTransactions(householdId);
      setSummary({
        imported: toImport.length,
        duplicates: preview.duplicates.length + (candidates.length - toImport.length),
        other: toImport.filter((r) => r.kind === 'expense' && r.categoryGuess === 'Other').length,
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
        <ImportSummaryView summary={summary} />
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

  const { newExpenses, newIncome, duplicates, fileName, source, truncated, outOfWindow } = preview;
  const total = newExpenses.length + newIncome.length;
  const nothing = total === 0;

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
              label: nothing ? 'Няма нови' : `Импортирай ${total}`,
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

      {outOfWindow ? (
        <Text className="mb-md font-inter text-body-md text-tertiary">
          {`Файлът съдържа редове отпреди ${TRANSACTION_WINDOW_MONTHS} месеца — те не се проверяват за дубликати.`}
        </Text>
      ) : null}

      {truncated ? (
        <Text className="mb-md font-inter text-body-md text-tertiary">
          Банката върна непълен резултат — синхронизирай пак за останалите.
        </Text>
      ) : null}

      {newExpenses.length > 0 ? (
        <View className="mb-lg">
          <SectionLabel className="mb-sm">Нови разходи ({newExpenses.length})</SectionLabel>
          {newExpenses.map((r, i) => (
            <ImportRow key={`exp-${i}`} row={r} />
          ))}
        </View>
      ) : null}

      {newIncome.length > 0 ? (
        <View className="mb-lg">
          <SectionLabel className="mb-sm">Приходи ({newIncome.length})</SectionLabel>
          {newIncome.map((r, i) => (
            <ImportRow key={`inc-${i}`} row={r} badge="приход" />
          ))}
        </View>
      ) : null}

      {duplicates.length > 0 ? (
        <View className="mb-lg">
          <SectionLabel className="mb-sm">Дубликати ({duplicates.length})</SectionLabel>
          {duplicates.map((r, i) => (
            <ImportRow key={`dup-${i}`} row={r} muted badge="дубликат" />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

// Route-level crash fallback — keeps the rest of the nav tree alive.
export { ScreenErrorFallback as ErrorBoundary } from '@/components/ScreenErrorFallback';

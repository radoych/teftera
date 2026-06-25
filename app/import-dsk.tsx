import { MaterialIcons } from '@expo/vector-icons';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useState } from 'react';
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
import { normalizeDskRow, parseDskCsv, type NormalizedTransaction } from '@/services/dsk-import';
import { resolveCategoryId } from '@/lib/categories';
import { formatCurrency } from '@/lib/formatCurrency';

interface Preview {
  toImport: NormalizedTransaction[];
  duplicates: NormalizedTransaction[];
  income: NormalizedTransaction[];
  fileName: string;
}

type Status = 'idle' | 'reading' | 'ready' | 'importing' | 'done';

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
  const [status, setStatus] = useState<Status>('idle');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const transactions = useTransactionsStore((s) => s.transactions);
  const categories = useTransactionsStore((s) => s.categories);

  const pickAndParse = async () => {
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

      setPreview({ toImport, duplicates, income, fileName: file.name });
      setStatus('ready');
    } catch (err) {
      if (__DEV__) console.warn('[dsk-import] parse failed', err);
      setStatus('idle');
      Alert.alert('Грешка', 'Файлът не можа да бъде прочетен. Опитай с друг CSV.');
    }
  };

  const onImport = async () => {
    if (!preview || preview.toImport.length === 0 || status === 'importing') return;
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

  // Initial / reading states
  if (!preview) {
    return (
      <Screen>
        <Header />
        {status === 'reading' ? (
          <View className="items-center py-xxl">
            <ActivityIndicator color="#adc7ff" />
            <Text className="mt-md font-inter text-body-md text-on-surface-variant opacity-70">
              Обработка на файла…
            </Text>
          </View>
        ) : (
          <EmptyState
            icon="upload-file"
            title="Избери извлечение"
            message="Импортирай CSV извлечение, изтеглено от онлайн банкирането на DSK."
            cta={{ label: 'Избери CSV файл', onPress: pickAndParse }}
          />
        )}
      </Screen>
    );
  }

  const { toImport, duplicates, income, fileName } = preview;
  const nothing = toImport.length === 0;

  return (
    <Screen
      floatingAboveTabBar={
        <FloatingActionBar
          actions={[
            {
              label: 'Друг файл',
              icon: 'folder-open',
              variant: 'ghost',
              onPress: pickAndParse,
            },
            {
              label: nothing ? 'Няма нови' : `Импортирай ${toImport.length}`,
              icon: 'check',
              variant: 'filled',
              disabled: nothing,
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

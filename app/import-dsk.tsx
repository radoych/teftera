import { MaterialIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
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

type Status = 'idle' | 'reading' | 'ready' | 'importing';

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
  const transactions = useTransactionsStore((s) => s.transactions);
  const categories = useTransactionsStore((s) => s.categories);

  const pickAndParse = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset) return;
      setStatus('reading');
      const text = await new File(asset.uri).text();

      const rows = parseDskCsv(text).map(normalizeDskRow);
      const expenses = rows.filter((r) => r.kind === 'expense');
      const income = rows.filter((r) => r.kind === 'income');
      const { toImport, duplicates } = dedupeImport(expenses, transactions);

      setPreview({ toImport, duplicates, income, fileName: asset.name });
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
      router.back();
    } catch {
      setStatus('ready');
      Alert.alert('Грешка', 'Импортирането не успя. Опитай отново.');
    }
  };

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

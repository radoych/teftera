import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDigitsAsAmount } from '@/components/AmountInput';
import { BackgroundGlow } from '@/components/BackgroundGlow';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { HairlineDivider } from '@/components/HairlineDivider';
import { useAuthStore } from '@/features/auth/store';
import { runDetection } from '@/features/anomalies/runDetection';
import { runBudgetCheck } from '@/features/budgets/runBudgetCheck';
import { useBudgetsStore } from '@/features/budgets/store';
import { usePreferencesStore } from '@/features/preferences/store';
import { createTransaction, updateTransaction } from '@/features/transactions/api';
import { CategoryPickerModal } from '@/features/transactions/components/CategoryPickerModal';
import { DateField } from '@/features/transactions/components/DateField';
import { transactionToFormValues } from '@/features/transactions/edit';
import { parseManualEntry } from '@/features/transactions/schema';
import { useTransactionsStore } from '@/features/transactions/store';
import { refreshTransactions } from '@/features/transactions/sync';
import { guessCategory, resolveCategoryId } from '@/lib/categories';
import { toISODate } from '@/lib/dates';
import { useIsOnline } from '@/lib/useIsOnline';

function FieldRow({
  label,
  children,
  onPress,
  chevron,
}: {
  label: string;
  children: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
}) {
  const Body = (
    <View className="flex-row items-center justify-between px-6 py-5">
      <View className="flex-1 gap-1">
        <Text className="font-inter-medium text-label-md uppercase text-on-surface-variant opacity-60">
          {label}
        </Text>
        {children}
      </View>
      {chevron ? <MaterialIcons name="expand-more" size={22} color="#c4c6d0" /> : null}
    </View>
  );
  return (
    <View>
      {onPress ? (
        <Pressable onPress={onPress} className="active:bg-white/5">
          {Body}
        </Pressable>
      ) : (
        Body
      )}
      <HairlineDivider />
    </View>
  );
}

export default function ManualEntryScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;
  const categories = useTransactionsStore((s) => s.categories);
  const existing = useTransactionsStore((s) =>
    id ? s.transactions.find((t) => t.id === id) : undefined,
  );

  const seed = useMemo(
    () => (existing ? transactionToFormValues(existing) : null),
    [existing],
  );

  const [amount, setAmount] = useState(seed?.amount ? formatDigitsAsAmount(seed.amount) : '');
  const [merchant, setMerchant] = useState(seed?.merchant ?? '');
  const [note, setNote] = useState(seed?.note ?? '');
  const [date, setDate] = useState(seed?.date ?? toISODate());
  const [categoryId, setCategoryId] = useState<string | null>(seed?.categoryId ?? null);
  const [categoryTouched, setCategoryTouched] = useState(isEdit);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [errors, setErrors] = useState<{ amount?: string; merchant?: string }>({});
  const [saving, setSaving] = useState(false);
  const online = useIsOnline();

  // Edit mode but the transaction is gone (deleted on another device).
  if (isEdit && !existing) {
    return (
      <View className="flex-1 bg-background">
        <BackgroundGlow />
        <SafeAreaView className="flex-1 items-center justify-center px-8" edges={['top']}>
          <Text className="text-center font-inter text-body-lg text-on-surface-variant">
            {'Транзакцията не е намерена.'}
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="mt-lg rounded-full border border-primary-container px-6 py-2">
            <Text className="font-inter text-label-md text-primary-container">{'Назад'}</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  const selectedCategory = categoryId ? categories.find((c) => c.id === categoryId) : undefined;
  const categoryLabel = selectedCategory
    ? selectedCategory.name
    : merchant.trim() && !categoryTouched
      ? guessCategory(merchant)
      : 'Автоматично';

  const onSave = async () => {
    if (saving) return;
    const parsed = parseManualEntry({ amount, merchant, note, date });
    if (!parsed.success) {
      setErrors({ amount: parsed.errors.amount, merchant: parsed.errors.merchant });
      return;
    }
    setErrors({});

    const { householdId, session } = useAuthStore.getState();
    if (!householdId) {
      Alert.alert('Грешка', 'Няма активно домакинство.');
      return;
    }
    const resolvedCategoryId = categoryTouched
      ? categoryId
      : resolveCategoryId(parsed.data.merchant, categories);

    setSaving(true);
    let createdId: string | null = null;
    try {
      if (isEdit && id) {
        await updateTransaction(id, {
          amountCents: parsed.data.amountCents,
          merchant: parsed.data.merchant,
          categoryId: resolvedCategoryId,
          date: parsed.data.date,
          note: parsed.data.note,
        });
      } else {
        const { id: newId } = await createTransaction({
          householdId,
          userId: session?.user.id ?? null,
          amountCents: parsed.data.amountCents,
          merchant: parsed.data.merchant,
          categoryId: resolvedCategoryId,
          date: parsed.data.date,
          note: parsed.data.note,
        });
        createdId = newId;
      }
    } catch {
      setSaving(false);
      Alert.alert(
        'Грешка',
        isEdit ? 'Неуспешна редакция. Опитай отново.' : 'Неуспешно записване. Опитай отново.',
      );
      return;
    }
    // Refresh + detection are non-fatal: the save already succeeded, so a failure
    // here must not invite a retry that would double-insert.
    try {
      await refreshTransactions(householdId);
      if (createdId !== null) {
        await runDetection({
          transactionId: createdId,
          householdId,
          amountCents: parsed.data.amountCents,
          categoryId: resolvedCategoryId,
          transactions: useTransactionsStore.getState().transactions,
        });
        await runBudgetCheck({
          householdId,
          savedCategoryId: resolvedCategoryId,
          alertsEnabled: usePreferencesStore.getState().preferences.budgetAlertsEnabled ?? true,
          transactions: useTransactionsStore.getState().transactions,
          categories: useTransactionsStore.getState().categories,
          budgets: useBudgetsStore.getState().rows,
        });
      }
    } catch {
      // List reconciles on next focus / realtime refetch.
    }
    router.back();
  };

  return (
    <View className="flex-1 bg-background">
      <BackgroundGlow />
      <SafeAreaView className="flex-1" edges={['top']}>
        {/* Top app bar */}
        <View className="flex-row items-center justify-between px-6 py-4">
          <Pressable onPress={() => router.back()} hitSlop={8} className="-ml-2 p-2">
            <MaterialIcons name="arrow-back" size={24} color="#e3e2e6" />
          </Pressable>
          <Text className="font-jakarta-semibold text-headline-lg-mobile text-on-surface">
            {isEdit ? 'Редактиране' : 'Ръчно въвеждане'}
          </Text>
          <View className="w-8" />
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 96 }}>
          {/* Amount */}
          <View className="mb-16 mt-12 flex-row items-center justify-center px-6">
            <Text className="font-jakarta-semibold text-[64px] text-on-surface opacity-30">{'€'}</Text>
            <TextInput
              value={amount}
              onChangeText={(t) => setAmount(formatDigitsAsAmount(t))}
              placeholder="0,00"
              placeholderTextColor="rgba(196,198,208,0.3)"
              keyboardType="number-pad"
              autoFocus={!isEdit}
              className="min-w-[120px] text-center font-jakarta-semibold text-[64px] text-on-surface"
            />
          </View>
          {errors.amount ? (
            <Text className="-mt-12 mb-6 text-center font-inter text-body-md text-error">
              {errors.amount}
            </Text>
          ) : null}

          {/* Merchant */}
          <FieldRow label="Търговец">
            <TextInput
              value={merchant}
              onChangeText={setMerchant}
              placeholder="напр. Starbucks"
              placeholderTextColor="rgba(196,198,208,0.3)"
              className="font-inter text-body-lg text-on-surface"
            />
            {errors.merchant ? (
              <Text className="font-inter text-body-md text-error">{errors.merchant}</Text>
            ) : null}
          </FieldRow>

          {/* Category — opens the picker */}
          <FieldRow label="Категория" chevron onPress={() => setPickerOpen(true)}>
            <Text className="font-inter text-body-lg text-on-surface">{categoryLabel}</Text>
          </FieldRow>

          {/* Date — native picker */}
          <DateField value={date} onChange={setDate} />

          {/* Note */}
          <FieldRow label="Бележка">
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Незадължителна бележка"
              placeholderTextColor="rgba(196,198,208,0.3)"
              className="font-inter text-body-lg text-on-surface"
            />
          </FieldRow>
        </ScrollView>
      </SafeAreaView>

      <FloatingActionBar
        liftWithKeyboard
        actions={[
          {
            label: isEdit ? 'Запази' : 'Готово',
            icon: 'check',
            variant: 'filled',
            loading: saving,
            disabled: !online,
            onPress: onSave,
          },
        ]}
      />

      <CategoryPickerModal
        visible={pickerOpen}
        categories={categories}
        selectedId={categoryId}
        onSelect={(cid) => {
          setCategoryId(cid);
          setCategoryTouched(true);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

// Route-level crash fallback — keeps the rest of the nav tree alive.
export { ScreenErrorFallback as ErrorBoundary } from '@/components/ScreenErrorFallback';

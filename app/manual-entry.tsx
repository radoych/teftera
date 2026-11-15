import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDigitsAsAmount } from '@/components/AmountInput';
import { BackgroundGlow } from '@/components/BackgroundGlow';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { HairlineDivider } from '@/components/HairlineDivider';
import { NotFoundView } from '@/components/NotFoundView';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SegmentedToggle } from '@/components/SegmentedToggle';
import { useAuthStore } from '@/features/auth/store';
import { runAfterSave } from '@/features/transactions/afterSave';
import { createTransaction, updateTransaction } from '@/features/transactions/api';
import { CategoryPickerModal } from '@/features/transactions/components/CategoryPickerModal';
import { DateField } from '@/features/transactions/components/DateField';
import { transactionToFormValues } from '@/features/transactions/edit';
import type { TxKind } from '@/features/transactions/kind';
import { expenseCategories, incomeCategories } from '@/features/transactions/kind';
import { parseManualEntry } from '@/features/transactions/schema';
import { useTransactionsStore } from '@/features/transactions/store';
import { guessCategory, guessIncomeCategory, resolveCategoryId } from '@/lib/categories';
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
  const [kind, setKind] = useState<TxKind>(seed?.kind ?? 'expense');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [errors, setErrors] = useState<{ amount?: string; merchant?: string }>({});
  const [saving, setSaving] = useState(false);
  const online = useIsOnline();

  // Edit mode but the transaction is gone (deleted on another device).
  if (isEdit && !existing) {
    return <NotFoundView message="Транзакцията не е намерена." />;
  }

  const selectedCategory = categoryId ? categories.find((c) => c.id === categoryId) : undefined;
  const categoryLabel = selectedCategory
    ? selectedCategory.name
    : kind === 'income'
      ? merchant.trim() && !categoryTouched
        ? guessIncomeCategory(merchant)
        : 'Друг приход'
      : merchant.trim() && !categoryTouched
        ? guessCategory(merchant)
        : 'Автоматично';

  const onKindChange = (next: TxKind) => {
    setKind(next);
    const selected = categoryId ? categories.find((c) => c.id === categoryId) : undefined;
    if (selected && selected.kind !== next) {
      setCategoryId(null);
      setCategoryTouched(false);
    }
  };

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
      : resolveCategoryId(parsed.data.merchant, categories, kind);

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
          kind,
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
          kind,
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
    // Non-fatal: the save already succeeded, so nothing after it may invite a
    // retry that would double-insert.
    await runAfterSave({
      householdId,
      transactionId: createdId,
      kind,
      amountCents: parsed.data.amountCents,
      categoryId: resolvedCategoryId,
      merchant: parsed.data.merchant,
    });
    router.back();
  };

  return (
    <View className="flex-1 bg-background">
      <BackgroundGlow />
      <SafeAreaView className="flex-1" edges={['top']}>
        <ScreenHeader centered title={isEdit ? 'Редактиране' : 'Ръчно въвеждане'} className="px-6" />

        <KeyboardAwareScrollView
          bottomOffset={140}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 96 }}>
          {/* Expense / income toggle */}
          <View className="mb-md mt-6 items-center">
            <SegmentedToggle<TxKind>
              value={kind}
              onChange={onKindChange}
              options={[
                { value: 'expense', label: 'Разход' },
                { value: 'income', label: 'Приход' },
              ]}
            />
          </View>

          {/* Amount */}
          <View className="mb-16 mt-4 flex-row items-center justify-center px-6">
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
        </KeyboardAwareScrollView>
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
        categories={kind === 'income' ? incomeCategories(categories) : expenseCategories(categories)}
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

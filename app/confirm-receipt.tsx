import { MaterialIcons } from '@expo/vector-icons';
import { File } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackgroundGlow } from '@/components/BackgroundGlow';
import { HairlineDivider } from '@/components/HairlineDivider';
import { PillButton } from '@/components/PillButton';
import { SectionLabel } from '@/components/SectionLabel';
import { useAuthStore } from '@/features/auth/store';
import {
  extractionToForm,
  itemsSumCents,
  itemsToNote,
  type ReceiptFormItem,
} from '@/features/receipts/extraction';
import { saveReceiptTransaction } from '@/features/receipts/save';
import { CategoryPickerModal } from '@/features/transactions/components/CategoryPickerModal';
import { DateField } from '@/features/transactions/components/DateField';
import { parseManualEntry } from '@/features/transactions/schema';
import { useTransactionsStore } from '@/features/transactions/store';
import { refreshTransactions } from '@/features/transactions/sync';
import { resolveCategoryId } from '@/lib/categories';
import { toISODate } from '@/lib/dates';
import { extractReceipt } from '@/services/gemini';
import { formatCurrency, parseAmountToCents } from '@/lib/formatCurrency';

type Phase = 'extracting' | 'ready';

export default function ConfirmReceiptScreen() {
  const { storagePath, previewUri } = useLocalSearchParams<{
    storagePath?: string;
    previewUri?: string;
  }>();
  const categories = useTransactionsStore((s) => s.categories);

  const [phase, setPhase] = useState<Phase>('extracting');
  const [merchant, setMerchant] = useState('');
  const [total, setTotal] = useState('');
  const [date, setDate] = useState(toISODate());
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [items, setItems] = useState<ReceiptFormItem[]>([]);
  const [rawGeminiJson, setRawGeminiJson] = useState<unknown>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [errors, setErrors] = useState<{ amount?: string; merchant?: string }>({});
  const [saving, setSaving] = useState(false);
  const started = useRef(false);

  const runExtraction = useCallback(async () => {
    if (!previewUri) {
      setPhase('ready');
      return;
    }
    try {
      const base64 = await new File(previewUri).base64();
      const result = await extractReceipt(base64);
      if (result.ok) {
        const seed = extractionToForm(result.data);
        setMerchant(seed.merchant);
        setTotal(seed.total);
        setDate(seed.date);
        setItems(seed.items);
        setRawGeminiJson(result.raw);
      }
    } catch (err) {
      if (__DEV__) console.warn('[confirm-receipt] extraction failed', err);
    } finally {
      setPhase('ready');
    }
  }, [previewUri]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    runExtraction();
  }, [runExtraction]);

  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));
  const addItem = () =>
    setItems((prev) => [...prev, { id: String(Date.now()), description: '', amount: '' }]);

  // Reconciliation: soft hint only, never blocks save.
  const totalCents = parseAmountToCents(total);
  const sumCents = itemsSumCents(items);
  const showMismatch =
    items.length > 0 && totalCents !== null && totalCents > 0 && sumCents !== totalCents;

  const selectedCategory = categoryId ? categories.find((c) => c.id === categoryId) : undefined;
  const categoryLabel = selectedCategory
    ? selectedCategory.name
    : 'Автоматично';

  const onSave = async () => {
    if (saving || phase !== 'ready') return;
    const note = itemsToNote(items);
    const parsed = parseManualEntry({ amount: total, merchant, note, date });
    if (!parsed.success) {
      setErrors({ amount: parsed.errors.amount, merchant: parsed.errors.merchant });
      return;
    }
    setErrors({});

    const { householdId, session } = useAuthStore.getState();
    if (!householdId || !storagePath) {
      Alert.alert('Грешка', 'Липсва домакинство или бележка.');
      return;
    }
    const resolvedCategoryId = categoryTouched
      ? categoryId
      : resolveCategoryId(parsed.data.merchant, categories);

    setSaving(true);
    try {
      await saveReceiptTransaction({
        householdId,
        userId: session?.user.id ?? null,
        storagePath,
        rawGeminiJson,
        amountCents: parsed.data.amountCents,
        merchant: parsed.data.merchant,
        categoryId: resolvedCategoryId,
        date: parsed.data.date,
        note: parsed.data.note,
      });
    } catch {
      setSaving(false);
      Alert.alert('Грешка', 'Неуспешно записване. Опитай отново.');
      return;
    }
    try {
      await refreshTransactions(householdId);
    } catch {
      // Non-fatal: the save already succeeded; the list reconciles on next focus.
    }
    router.replace('/(app)');
  };

  return (
    <View className="flex-1 bg-background">
      <BackgroundGlow />
      <SafeAreaView className="flex-1" edges={['top']}>
        {/* Top bar */}
        <View className="flex-row items-center justify-between px-8 py-4">
          <View className="w-6" />
          <Text className="font-jakarta-medium text-headline-md text-on-surface">
            Потвърди бележката
          </Text>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <MaterialIcons name="close" size={24} color="#e3e2e6" />
          </Pressable>
        </View>

        <ScrollView
          className="px-8"
          contentContainerClassName="pb-40"
          keyboardShouldPersistTaps="handled">
          {/* Thumbnail */}
          <View className="my-xl items-center">
            {previewUri ? (
              <Image
                source={{ uri: previewUri }}
                className="h-28 w-20 rounded-xl"
                resizeMode="cover"
              />
            ) : (
              <View className="h-28 w-20 items-center justify-center rounded-xl bg-surface-container-high">
                <MaterialIcons name="receipt-long" size={28} color="rgba(255,255,255,0.4)" />
              </View>
            )}
          </View>

          {phase === 'extracting' ? (
            <View className="items-center gap-md py-xl">
              <ActivityIndicator size="large" color="#adc7ff" />
              <Text className="font-inter text-body-lg text-on-surface-variant">
                Разчитане на бележката…
              </Text>
            </View>
          ) : (
            <>
              {/* Merchant */}
              <View className="mb-xl">
                <SectionLabel className="mb-1">Търговец</SectionLabel>
                <TextInput
                  value={merchant}
                  onChangeText={setMerchant}
                  placeholder="Въведи търговец"
                  placeholderTextColor="rgba(142,144,154,0.5)"
                  className="font-jakarta-semibold text-headline-lg-mobile text-on-surface"
                />
                {errors.merchant ? (
                  <Text className="mt-1 font-inter text-body-md text-error">{errors.merchant}</Text>
                ) : null}
                <HairlineDivider className="mt-xs" />
              </View>

              {/* Total */}
              <View className="mb-xl">
                <SectionLabel className="mb-1">Общо</SectionLabel>
                <View className="flex-row items-baseline">
                  <Text className="mr-1 font-jakarta-semibold text-headline-xl text-primary-container">
                    €
                  </Text>
                  <TextInput
                    value={total}
                    onChangeText={setTotal}
                    placeholder="0,00"
                    placeholderTextColor="rgba(142,144,154,0.5)"
                    keyboardType="decimal-pad"
                    className="flex-1 font-jakarta-semibold text-headline-xl text-on-surface"
                  />
                </View>
                {errors.amount ? (
                  <Text className="mt-1 font-inter text-body-md text-error">{errors.amount}</Text>
                ) : null}
                {showMismatch ? (
                  <Text className="mt-1 font-inter text-body-md text-on-surface-variant opacity-70">
                    {`Артикулите сборуват ${formatCurrency(sumCents)} — общо ${formatCurrency(
                      totalCents ?? 0,
                    )}`}
                  </Text>
                ) : null}
                <HairlineDivider className="mt-xs" />
              </View>

              {/* Date + Category */}
              <DateField value={date} onChange={setDate} />
              <Pressable
                onPress={() => setPickerOpen(true)}
                className="active:bg-white/5">
                <View className="flex-row items-center justify-between py-5">
                  <View className="flex-1 gap-1">
                    <Text className="font-inter-medium text-label-md uppercase text-on-surface-variant opacity-60">
                      Категория
                    </Text>
                    <Text className="font-inter text-body-lg text-on-surface">{categoryLabel}</Text>
                  </View>
                  <MaterialIcons name="expand-more" size={22} color="#c4c6d0" />
                </View>
              </Pressable>
              <HairlineDivider className="mb-xl" />

              {/* Items */}
              <SectionLabel className="mb-md">Артикули</SectionLabel>
              {items.map((item) => (
                <View key={item.id}>
                  <View className="flex-row items-center justify-between py-md">
                    <TextInput
                      value={item.description}
                      onChangeText={(t) =>
                        setItems((prev) =>
                          prev.map((i) => (i.id === item.id ? { ...i, description: t } : i)),
                        )
                      }
                      placeholder="Артикул"
                      placeholderTextColor="rgba(142,144,154,0.5)"
                      className="flex-1 font-inter text-body-lg text-on-surface"
                    />
                    <View className="flex-row items-center gap-md">
                      <View className="flex-row items-center">
                        <Text className="mr-1 font-inter text-label-md text-on-surface-variant">€</Text>
                        <TextInput
                          value={item.amount}
                          onChangeText={(t) =>
                            setItems((prev) =>
                              prev.map((i) => (i.id === item.id ? { ...i, amount: t } : i)),
                            )
                          }
                          keyboardType="decimal-pad"
                          className="w-16 text-right font-inter-semibold text-data-mono text-on-surface"
                        />
                      </View>
                      <Pressable onPress={() => removeItem(item.id)} hitSlop={8}>
                        <MaterialIcons name="delete" size={18} color="#ffb4ab" />
                      </Pressable>
                    </View>
                  </View>
                  <HairlineDivider />
                </View>
              ))}

              <Pressable onPress={addItem} className="flex-row items-center py-md active:opacity-70">
                <MaterialIcons name="add" size={20} color="#adc7ff" />
                <Text className="ml-md font-inter text-body-md text-on-surface-variant">
                  Добави артикул
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>

        {/* Bottom actions */}
        <View className="absolute inset-x-0 bottom-0 flex-row gap-md bg-background px-8 pb-8 pt-md">
          <View className="flex-1">
            <PillButton
              label="Отново"
              variant="ghost"
              uppercase
              block
              onPress={() => router.replace('/scanner')}
            />
          </View>
          <View className="flex-1">
            <PillButton
              label="Запази"
              variant="filled"
              uppercase
              block
              loading={saving}
              onPress={onSave}
            />
          </View>
        </View>
      </SafeAreaView>

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

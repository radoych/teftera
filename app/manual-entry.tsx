import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackgroundGlow } from '@/components/BackgroundGlow';
import { HairlineDivider } from '@/components/HairlineDivider';
import { useAuthStore } from '@/features/auth/store';
import { createTransaction } from '@/features/transactions/api';
import { parseManualEntry } from '@/features/transactions/schema';
import { useTransactionsStore } from '@/features/transactions/store';
import { guessCategory, resolveCategoryId } from '@/lib/categories';
import { toISODate } from '@/lib/dates';

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
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; merchant?: string }>({});
  const [saving, setSaving] = useState(false);

  const onDone = async () => {
    if (saving) return;
    const parsed = parseManualEntry({ amount, merchant, note, date: toISODate() });
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
    const categories = useTransactionsStore.getState().categories;
    const categoryId = resolveCategoryId(parsed.data.merchant, categories);

    setSaving(true);
    try {
      await createTransaction({
        householdId,
        userId: session?.user.id ?? null,
        amountCents: parsed.data.amountCents,
        merchant: parsed.data.merchant,
        categoryId,
        date: parsed.data.date,
        note: parsed.data.note,
      });
      router.back(); // realtime sync refreshes the lists
    } catch {
      setSaving(false);
      Alert.alert('Грешка', 'Неуспешно записване. Опитай отново.');
    }
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
            Ръчно въвеждане
          </Text>
          <Pressable onPress={onDone} hitSlop={8} disabled={saving} className="px-2 py-1">
            {saving ? (
              <ActivityIndicator color="#adc7ff" />
            ) : (
              <Text className="font-inter-medium text-label-md text-primary-container">ГОТОВО</Text>
            )}
          </Pressable>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled">
          {/* Amount */}
          <View className="mb-16 mt-12 flex-row items-center justify-center px-6">
            <Text className="font-jakarta-semibold text-[64px] text-on-surface opacity-30">€</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="0,00"
              placeholderTextColor="rgba(196,198,208,0.3)"
              keyboardType="decimal-pad"
              autoFocus
              className="min-w-[120px] text-center font-jakarta-semibold text-[64px] text-on-surface"
            />
          </View>
          {errors.amount ? (
            <Text className="-mt-12 mb-6 text-center font-inter text-body-md text-error">
              {errors.amount}
            </Text>
          ) : null}

          {/* Form */}
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

          <FieldRow label="Категория">
            <Text className="font-inter text-body-lg text-on-surface">
              {merchant.trim() ? guessCategory(merchant) : 'Автоматично'}
            </Text>
          </FieldRow>

          <FieldRow label="Дата">
            <Text className="font-inter text-body-lg text-on-surface">Днес</Text>
          </FieldRow>

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
    </View>
  );
}

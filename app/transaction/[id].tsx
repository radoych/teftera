import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackgroundGlow } from '@/components/BackgroundGlow';
import { HairlineDivider } from '@/components/HairlineDivider';
import { useAuthStore } from '@/features/auth/store';
import { getMembers, type HouseholdMember } from '@/features/household/api';
import { deleteTransaction } from '@/features/transactions/api';
import { memberName } from '@/features/transactions/edit';
import { useTransactionsStore } from '@/features/transactions/store';
import { refreshTransactions } from '@/features/transactions/sync';
import type { MaterialIconName } from '@/lib/categories';
import { relativeDay } from '@/lib/dates';
import { formatCurrency } from '@/lib/formatCurrency';

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <View className="flex-row items-center justify-between gap-md px-6 py-4">
        <Text className="font-inter-medium text-label-md uppercase text-on-surface-variant opacity-60">
          {label}
        </Text>
        <Text className="flex-1 text-right font-inter text-body-lg text-on-surface" numberOfLines={1}>
          {value}
        </Text>
      </View>
      <HairlineDivider />
    </View>
  );
}

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tx = useTransactionsStore((s) => s.transactions.find((t) => t.id === id));
  const categories = useTransactionsStore((s) => s.categories);
  const householdId = useAuthStore((s) => s.householdId);
  const [members, setMembers] = useState<HouseholdMember[]>([]);

  useEffect(() => {
    if (householdId) getMembers(householdId).then(setMembers);
  }, [householdId]);

  if (!tx) {
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

  const cat = tx.category_id ? categories.find((c) => c.id === tx.category_id) : undefined;
  const catName = cat?.name ?? 'Other';
  const catIcon = (cat?.icon as MaterialIconName) ?? 'category';
  const catColor = cat?.color ?? '#8e909a';
  const addedBy = memberName(tx.user_id, members);

  const onDelete = () => {
    Alert.alert('Изтриване', 'Сигурни ли сте, че искате да изтриете тази транзакция?', [
      { text: 'Отказ', style: 'cancel' },
      {
        text: 'Изтрий',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTransaction(tx.id);
            if (householdId) await refreshTransactions(householdId);
            router.back();
          } catch {
            Alert.alert('Грешка', 'Неуспешно изтриване. Опитай отново.');
          }
        },
      },
    ]);
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
            {'Транзакция'}
          </Text>
          <View className="w-8" />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          {/* Hero */}
          <View className="items-center py-xl">
            <Text
              className="font-jakarta-semibold text-on-surface"
              style={{ fontSize: 56, lineHeight: 64 }}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}>
              {formatCurrency(tx.amount_eur)}
            </Text>
            <Text className="mt-sm font-jakarta-semibold text-headline-md text-on-surface">
              {tx.merchant}
            </Text>
            <View className="mt-md flex-row items-center gap-2 rounded-full bg-surface-container px-4 py-2">
              <MaterialIcons name={catIcon} size={18} color={catColor} />
              <Text className="font-inter text-body-md text-on-surface">{catName}</Text>
            </View>
          </View>

          <HairlineDivider />
          <DetailRow label="Дата" value={relativeDay(tx.date)} />
          <DetailRow label="Бележка" value={tx.note?.trim() ? tx.note : '—'} />
          <DetailRow label="Добавено от" value={addedBy} />

          {/* Actions */}
          <View className="mt-xl gap-md px-6">
            <Pressable
              onPress={() => router.navigate(`/manual-entry?id=${tx.id}`)}
              className="items-center rounded-full border border-primary-container py-3 active:bg-primary-container/10">
              <Text className="font-inter text-label-md text-primary-container">{'Редакция'}</Text>
            </Pressable>
            <Pressable onPress={onDelete} className="items-center py-3 active:opacity-70">
              <Text className="font-inter text-label-md text-error">{'Изтрий'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

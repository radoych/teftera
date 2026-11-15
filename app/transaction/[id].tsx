import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackgroundGlow } from '@/components/BackgroundGlow';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { HairlineDivider } from '@/components/HairlineDivider';
import { useAuthStore } from '@/features/auth/store';
import { useHouseholdStore } from '@/features/household/store';
import { deleteTransaction } from '@/features/transactions/api';
import { memberName } from '@/features/transactions/edit';
import { useTransactionsStore } from '@/features/transactions/store';
import { refreshTransactions } from '@/features/transactions/sync';
import { categoryPresentation } from '@/lib/categories';
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
  const members = useHouseholdStore((s) => s.members);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

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

  const {
    name: catName,
    icon: catIcon,
    color: catColor,
  } = categoryPresentation(
    tx.category_id ? categories.find((c) => c.id === tx.category_id) : undefined,
  );
  const addedBy = memberName(tx.user_id, members);

  const onConfirmDelete = async () => {
    try {
      await deleteTransaction(tx.id);
      if (householdId) await refreshTransactions(householdId);
      setConfirmOpen(false);
      router.back();
    } catch {
      setConfirmOpen(false);
      setDeleteError(true);
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
            {'Транзакция'}
          </Text>
          <View className="w-8" />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 96 }}>
          {/* Hero */}
          <View className="items-center py-xl">
            <Text
              className={`font-jakarta-semibold ${tx.kind === 'income' ? 'text-primary' : 'text-on-surface'}`}
              style={{ fontSize: 56, lineHeight: 64 }}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}>
              {tx.kind === 'income' ? '+' : ''}
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
        </ScrollView>
      </SafeAreaView>
      <FloatingActionBar
        actions={[
          {
            label: 'Изтрий',
            icon: 'delete-outline',
            variant: 'destructive',
            onPress: () => setConfirmOpen(true),
          },
          {
            label: 'Редакция',
            icon: 'edit',
            variant: 'filled',
            onPress: () => router.navigate(`/manual-entry?id=${tx.id}`),
          },
        ]}
      />
      <ConfirmSheet
        visible={confirmOpen}
        title="Изтриване"
        message="Сигурни ли сте, че искате да изтриете тази транзакция?"
        confirmLabel="Изтрий"
        destructive
        onConfirm={onConfirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
      <ConfirmSheet
        visible={deleteError}
        title="Грешка"
        message="Неуспешно изтриване. Опитай отново."
        confirmLabel="Добре"
        onConfirm={() => setDeleteError(false)}
        onCancel={() => setDeleteError(false)}
      />
    </View>
  );
}

// Route-level crash fallback — keeps the rest of the nav tree alive.
export { ScreenErrorFallback as ErrorBoundary } from '@/components/ScreenErrorFallback';

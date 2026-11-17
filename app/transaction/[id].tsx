import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackgroundGlow } from '@/components/BackgroundGlow';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { HairlineDivider } from '@/components/HairlineDivider';
import { NotFoundView } from '@/components/NotFoundView';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAuthStore } from '@/features/auth/store';
import { useHouseholdStore } from '@/features/household/store';
import { deleteTransaction } from '@/features/transactions/api';
import { memberName } from '@/features/transactions/edit';
import { useTransactionsStore } from '@/features/transactions/store';
import { refreshTransactions } from '@/features/transactions/sync';
import { aliasAction } from '@/features/vendors/aliasAction';
import { addAlias } from '@/features/vendors/api';
import { RecognizedNameSheet } from '@/features/vendors/components/RecognizedNameSheet';
import { VendorConflictSheet } from '@/features/vendors/components/VendorConflictSheet';
import { refreshVendors } from '@/features/vendors/sync';
import type { AliasConflict, Vendor, VendorIndex } from '@/features/vendors/types';
import { categoryPresentation } from '@/lib/categories';
import { relativeDay } from '@/lib/dates';
import { formatCurrency } from '@/lib/formatCurrency';
import { colors } from '@/lib/theme';

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <View className="flex-row items-center justify-between gap-md px-6 py-4">
        <Text className="font-inter-medium text-label-md uppercase text-on-surface-variant opacity-60">
          {label}
        </Text>
        <Text
          className="flex-1 text-right font-inter text-body-lg text-on-surface"
          numberOfLines={1}
        >
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
  const [aliasOpen, setAliasOpen] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  /**
   * The name was taken by another vendor: resolve it, filing it under `vendor`.
   * Kept after close so the conflict sheet can slide out with its content.
   */
  const [conflict, setConflict] = useState<{
    conflict: AliasConflict;
    vendor: Vendor;
  } | null>(null);

  if (!tx) {
    return <NotFoundView message="Транзакцията не е намерена." />;
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

  /** After the conflict sheet freed / merged the key: file the merchant under the vendor. */
  const retryAlias = async (fresh: VendorIndex) => {
    if (!conflict || !householdId) return;
    const action = aliasAction(tx.merchant, conflict.vendor, fresh);
    if (action.kind === 'add') {
      await addAlias({
        householdId,
        vendorId: conflict.vendor.id,
        alias: action.alias,
        source: 'manual',
      });
    } else if (action.kind === 'conflict') {
      throw new Error('name still taken');
    }
  };

  return (
    <View className="flex-1 bg-background">
      <BackgroundGlow />
      <SafeAreaView className="flex-1" edges={['top']}>
        <ScreenHeader centered title="Транзакция" className="px-6" />

        <ScrollView contentContainerStyle={{ paddingBottom: 96 }}>
          {/* Hero */}
          <View className="items-center py-xl">
            <Text
              className={`font-jakarta-semibold ${tx.kind === 'income' ? 'text-primary' : 'text-on-surface'}`}
              style={{ fontSize: 56, lineHeight: 64 }}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
            >
              {tx.kind === 'income' ? '+' : ''}
              {formatCurrency(tx.amount_eur)}
            </Text>
            {/* The tag button hangs off the name's right edge so the name stays centered. */}
            <View className="mt-sm items-center self-stretch px-xl">
              <View>
                <Text
                  className="text-center font-jakarta-semibold text-headline-md text-on-surface"
                  numberOfLines={2}
                >
                  {tx.merchant}
                </Text>
                {householdId && tx.merchant.trim() ? (
                  <Pressable
                    onPress={() => setAliasOpen(true)}
                    hitSlop={14}
                    accessibilityRole="button"
                    accessibilityLabel="Разпознато име"
                    style={styles.aliasButton}
                  >
                    <MaterialIcons
                      name="label-outline"
                      size={16}
                      color={colors.onSurfaceVariant}
                      style={styles.aliasIcon}
                    />
                  </Pressable>
                ) : null}
              </View>
            </View>
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
            onPress: () => router.push(`/manual-entry?id=${tx.id}`),
          },
        ]}
      />
      {householdId ? (
        <>
          <RecognizedNameSheet
            visible={aliasOpen}
            householdId={householdId}
            merchant={tx.merchant}
            onClose={() => setAliasOpen(false)}
            onConflict={(c, vendor) => {
              setConflict({ conflict: c, vendor });
              setConflictOpen(true);
            }}
          />
          {conflict ? (
            <VendorConflictSheet
              visible={conflictOpen}
              conflict={conflict.conflict}
              editingVendor={conflict.vendor}
              retry={retryAlias}
              refresh={() => refreshVendors(householdId)}
              onResolved={() => setConflictOpen(false)}
              onClose={() => setConflictOpen(false)}
            />
          ) : null}
        </>
      ) : null}
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

const styles = StyleSheet.create({
  // Absolutely placed just past the name's right edge, vertically centered.
  aliasButton: {
    position: 'absolute',
    left: '100%',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingLeft: 6,
  },
  aliasIcon: { opacity: 0.35 },
});

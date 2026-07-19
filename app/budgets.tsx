import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { AmountInput } from '@/components/AmountInput';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { HairlineDivider } from '@/components/HairlineDivider';
import { Screen } from '@/components/Screen';
import { SectionLabel } from '@/components/SectionLabel';
import { useAuthStore } from '@/features/auth/store';
import { deleteBudget, upsertBudget } from '@/features/budgets/api';
import { resolveBudgetsForMonth } from '@/features/budgets/resolve';
import { loadBudgets, useBudgetsStore } from '@/features/budgets/store';
import { usePreferencesStore } from '@/features/preferences/store';
import { useTransactionsStore } from '@/features/transactions/store';
import { expenseCategories } from '@/features/transactions/kind';
import type { MaterialIconName } from '@/lib/categories';
import { firstOfMonth } from '@/lib/dates';

function Header() {
  return (
    <View className="mb-md flex-row items-center gap-3 py-2">
      <Pressable onPress={() => router.back()} hitSlop={8} className="-ml-2 p-2">
        <MaterialIcons name="arrow-back" size={24} color="#e3e2e6" />
      </Pressable>
      <Text className="font-jakarta-semibold text-headline-lg-mobile text-on-surface">
        Бюджети
      </Text>
    </View>
  );
}

export default function BudgetsScreen() {
  const householdId = useAuthStore((s) => s.householdId);
  const allCategories = useTransactionsStore((s) => s.categories);
  const categories = useMemo(() => expenseCategories(allCategories), [allCategories]);
  const rows = useBudgetsStore((s) => s.rows);
  const loaded = useBudgetsStore((s) => s.loaded);
  const preferences = usePreferencesStore((s) => s.preferences);

  // User edits are tracked as overrides on top of the resolved (carry-forward) values.
  // Using overrides avoids calling setState inside useEffect.
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const hasAskedPermission = useRef(false);

  // Load budgets on mount if not yet loaded.
  useEffect(() => {
    if (!householdId) return;
    if (!useBudgetsStore.getState().loaded) {
      void loadBudgets(householdId);
    }
  }, [householdId]);

  // Effective draft: resolved carry-forward values merged with user overrides.
  // Recomputes when rows load or the user changes a field.
  const draft = useMemo<Record<string, number>>(() => {
    const resolved = resolveBudgetsForMonth(rows, firstOfMonth());
    const result: Record<string, number> = {};
    for (const cat of categories) {
      // ?? (not ||) so the user can intentionally zero out a budget.
      result[cat.id] = overrides[cat.id] ?? resolved.get(cat.id) ?? 0;
    }
    return result;
  }, [rows, categories, overrides]);

  const setAmount = useCallback((categoryId: string, cents: number) => {
    setOverrides((prev) => ({ ...prev, [categoryId]: cents }));
  }, []);

  const onSave = async () => {
    if (!householdId || saving) return;
    setSaving(true);
    try {
      const currentMonth = firstOfMonth();
      // Build a map of current-month rows — needed for "delete only if row exists" logic.
      const currentMonthMap = new Map(
        rows
          .filter((r) => r.month === currentMonth && r.category_id !== null)
          .map((r) => [r.category_id!, r]),
      );

      await Promise.all(
        categories.map(async (cat) => {
          const amountCents = draft[cat.id] ?? 0;
          if (amountCents > 0) {
            await upsertBudget({ householdId, categoryId: cat.id, amountCents, month: currentMonth });
          } else if (currentMonthMap.has(cat.id)) {
            // Only delete if a current-month row actually exists in the DB.
            await deleteBudget({ householdId, categoryId: cat.id, month: currentMonth });
          }
        }),
      );

      await loadBudgets(householdId);

      // Request notification permission after the first successful save (non-blocking).
      if (!hasAskedPermission.current && (preferences.budgetAlertsEnabled ?? true)) {
        hasAskedPermission.current = true;
        import('@/features/budgets/notify')
          .then(({ ensureNotificationPermission }) => void ensureNotificationPermission())
          .catch(() => undefined);
      }

      router.back();
    } catch (err) {
      if (__DEV__) console.warn('[budgets] save failed', err);
      Alert.alert('Грешка', 'Запазването не успя. Опитай отново.');
    } finally {
      setSaving(false);
    }
  };

  // Loading state — budgets not yet fetched from the server.
  if (!loaded) {
    return (
      <Screen>
        <Header />
        <View className="items-center py-xxl">
          <ActivityIndicator color="#adc7ff" />
          <Text className="mt-md font-inter text-body-md text-on-surface-variant opacity-70">
            Зареждане на бюджети…
          </Text>
        </View>
      </Screen>
    );
  }

  // Empty state — should not occur in practice (defaults are seeded during household setup).
  if (categories.length === 0) {
    return (
      <Screen>
        <Header />
        <Text className="mt-lg font-inter text-body-md text-on-surface-variant opacity-70">
          Няма налични категории. Добави транзакция, за да заредиш категориите.
        </Text>
      </Screen>
    );
  }

  return (
    <Screen
      floatingAboveTabBar={
        <FloatingActionBar
          liftWithKeyboard
          actions={[
            {
              label: 'Запази',
              icon: 'check',
              variant: 'filled',
              loading: saving,
              onPress: () => void onSave(),
            },
          ]}
        />
      }>
      <Header />
      <SectionLabel className="mb-md">Месечни лимити</SectionLabel>
      {categories.map((cat) => (
        <View key={cat.id}>
          <View className="flex-row items-center justify-between py-md">
            <View className="flex-row items-center gap-md">
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: cat.color + '26',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <MaterialIcons
                  name={cat.icon as MaterialIconName}
                  size={18}
                  color={cat.color}
                />
              </View>
              <Text className="font-inter text-body-lg text-on-surface">{cat.name}</Text>
            </View>
            <View style={{ width: 112, alignItems: 'flex-end' }}>
              <AmountInput
                valueCents={draft[cat.id] ?? 0}
                onChangeCents={(cents) => setAmount(cat.id, cents)}
                placeholder="0,00"
              />
            </View>
          </View>
          <HairlineDivider />
        </View>
      ))}
    </Screen>
  );
}

// Route-level crash fallback — keeps the rest of the nav tree alive.
export { ScreenErrorFallback as ErrorBoundary } from '@/components/ScreenErrorFallback';

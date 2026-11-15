import { MaterialIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { FlatInput } from '@/components/FlatInput';
import { HairlineDivider } from '@/components/HairlineDivider';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionLabel } from '@/components/SectionLabel';
import { SegmentedToggle } from '@/components/SegmentedToggle';
import { SheetActions } from '@/components/SheetActions';
import { useAuthStore } from '@/features/auth/store';
import {
  createCategory,
  deleteCategory,
  updateCategory,
} from '@/features/transactions/api';
import type { CategoryLite } from '@/features/transactions/groupByDay';
import { expenseCategories, incomeCategories } from '@/features/transactions/kind';
import { useTransactionsStore } from '@/features/transactions/store';
import { refreshTransactions } from '@/features/transactions/sync';
import type { MaterialIconName } from '@/lib/categories';
import { COLOR_CHOICES } from '@/lib/palette';

const ICON_CHOICES: MaterialIconName[] = [
  'restaurant', 'local-cafe', 'shopping-basket', 'directions-car', 'home', 'bolt',
  'medical-services', 'movie', 'shopping-bag', 'category', 'pets', 'school',
  'flight', 'fitness-center', 'card-giftcard', 'savings',
  'payments', 'account-balance-wallet', 'trending-up',
];

type Draft = {
  id: string | null;
  name: string;
  icon: MaterialIconName;
  color: string;
  kind: 'expense' | 'income';
};

const emptyDraft: Draft = { id: null, name: '', icon: 'category', color: '#adc7ff', kind: 'expense' };

export default function CategoriesScreen() {
  const categories = useTransactionsStore((s) => s.categories);
  const householdId = useAuthStore((s) => s.householdId);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<CategoryLite | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openEdit = (c: CategoryLite) =>
    setDraft({
      id: c.id,
      name: c.name,
      icon: c.icon as MaterialIconName,
      color: c.color,
      kind: c.kind,
    });

  const onSave = async () => {
    if (!draft || saving || !householdId) return;
    const name = draft.name.trim();
    if (!name) return;
    setSaving(true);
    try {
      if (draft.id === null) {
        await createCategory({
          householdId,
          name,
          icon: draft.icon,
          color: draft.color,
          kind: draft.kind,
        });
      } else {
        await updateCategory(draft.id, { name, icon: draft.icon, color: draft.color });
      }
      await refreshTransactions(householdId);
      setDraft(null);
    } catch {
      Alert.alert('Грешка', 'Категорията не можа да бъде записана. Опитай отново.');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!toDelete || deleting || !householdId) return;
    setDeleting(true);
    try {
      await deleteCategory(toDelete.id);
      await refreshTransactions(householdId);
      setToDelete(null);
    } catch {
      Alert.alert('Грешка', 'Категорията не можа да бъде изтрита. Опитай отново.');
    } finally {
      setDeleting(false);
    }
  };

  const expenseList = useMemo(() => expenseCategories(categories), [categories]);
  const incomeList = useMemo(() => incomeCategories(categories), [categories]);

  const CategoryRow = ({ c }: { c: CategoryLite }) => (
    <View>
      <View className="flex-row items-center gap-md py-md">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-container">
          <MaterialIcons name={c.icon as MaterialIconName} size={20} color={c.color} />
        </View>
        <Pressable onPress={() => openEdit(c)} className="flex-1 active:opacity-70">
          <Text className="font-inter text-body-lg text-on-surface">{c.name}</Text>
          {c.is_default ? (
            <Text className="font-inter text-label-md text-on-surface-variant opacity-50">
              По подразбиране
            </Text>
          ) : null}
        </Pressable>
        <Pressable onPress={() => openEdit(c)} hitSlop={8} className="p-1">
          <MaterialIcons name="edit" size={18} color="#8e909a" />
        </Pressable>
        {c.is_default ? null : (
          <Pressable onPress={() => setToDelete(c)} hitSlop={8} className="p-1">
            <MaterialIcons name="delete" size={18} color="#ffb4ab" />
          </Pressable>
        )}
      </View>
      <HairlineDivider />
    </View>
  );

  return (
    <Screen>
      <ScreenHeader title="Категории" />

      <SectionLabel className="mb-sm">Разходи</SectionLabel>
      {expenseList.map((c) => (
        <CategoryRow key={c.id} c={c} />
      ))}
      <SectionLabel className="mb-sm mt-lg">Приходи</SectionLabel>
      {incomeList.map((c) => (
        <CategoryRow key={c.id} c={c} />
      ))}

      <Pressable
        onPress={() => setDraft(emptyDraft)}
        className="flex-row items-center gap-3 py-5 active:opacity-70">
        <MaterialIcons name="add" size={20} color="#adc7ff" />
        <Text className="font-inter text-body-md text-primary-container">Нова категория</Text>
      </Pressable>

      {/* Add / edit sheet */}
      <BottomSheet visible={draft !== null} onClose={() => setDraft(null)}>
        {draft ? (
          <View className="gap-lg px-6 pb-4 pt-2">
            <Text className="font-jakarta-semibold text-headline-md text-on-surface">
              {draft.id === null ? 'Нова категория' : 'Редакция на категория'}
            </Text>
            <FlatInput
              value={draft.name}
              onChangeText={(name) => setDraft({ ...draft, name })}
              placeholder="Име на категорията"
              autoCapitalize="sentences"
            />
            {draft.id === null ? (
              <View className="items-start">
                <SegmentedToggle<'expense' | 'income'>
                  value={draft.kind}
                  onChange={(kind) => setDraft({ ...draft, kind })}
                  options={[
                    { value: 'expense', label: 'Разход' },
                    { value: 'income', label: 'Приход' },
                  ]}
                />
              </View>
            ) : null}
            <View>
              <SectionLabel className="mb-md">Икона</SectionLabel>
              <View className="flex-row flex-wrap gap-sm">
                {ICON_CHOICES.map((icon) => {
                  const active = draft.icon === icon;
                  return (
                    <Pressable
                      key={icon}
                      onPress={() => setDraft({ ...draft, icon })}
                      className={`h-11 w-11 items-center justify-center rounded-full ${
                        active ? 'bg-primary-container' : 'bg-surface-container-high'
                      }`}>
                      <MaterialIcons
                        name={icon}
                        size={20}
                        color={active ? '#112f5e' : '#c4c6d0'}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View>
              <SectionLabel className="mb-md">Цвят</SectionLabel>
              <View className="flex-row flex-wrap gap-sm">
                {COLOR_CHOICES.map((color) => {
                  const active = draft.color === color;
                  return (
                    <Pressable
                      key={color}
                      onPress={() => setDraft({ ...draft, color })}
                      className="h-11 w-11 items-center justify-center rounded-full"
                      style={{
                        backgroundColor: color,
                        borderWidth: active ? 3 : 0,
                        borderColor: '#e3e2e6',
                      }}>
                      {active ? <MaterialIcons name="check" size={18} color="#121316" /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <SheetActions
              actions={[
                {
                  label: 'Запази',
                  onPress: onSave,
                  variant: 'filled',
                  loading: saving,
                  disabled: draft.name.trim() === '',
                },
                { label: 'Отказ', onPress: () => setDraft(null), variant: 'ghost' },
              ]}
            />
          </View>
        ) : null}
      </BottomSheet>

      <ConfirmSheet
        visible={toDelete !== null}
        title={`Изтриване на „${toDelete?.name ?? ''}"?`}
        message="Транзакциите в тази категория остават — стават без категория."
        confirmLabel={deleting ? 'Изтриване…' : 'Изтрий'}
        destructive
        onConfirm={onDelete}
        onCancel={() => setToDelete(null)}
      />
    </Screen>
  );
}

// Route-level crash fallback — keeps the rest of the nav tree alive.
export { ScreenErrorFallback as ErrorBoundary } from '@/components/ScreenErrorFallback';

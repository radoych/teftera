import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { FlatInput } from '@/components/FlatInput';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { NotFoundView } from '@/components/NotFoundView';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionLabel } from '@/components/SectionLabel';
import { SheetActions } from '@/components/SheetActions';
import { useAuthStore } from '@/features/auth/store';
import { NewListSheet } from '@/features/shopping/components/NewListSheet';
import { listMetaLabel } from '@/features/shopping/copy';
import { useListCounts, useListsByVendor } from '@/features/shopping/sync';
import { addAlias, deleteVendor, removeAlias, renameVendor } from '@/features/vendors/api';
import { AliasRow } from '@/features/vendors/components/AliasRow';
import { VendorConflictSheet } from '@/features/vendors/components/VendorConflictSheet';
import { conflictFromError, isUniqueViolation } from '@/features/vendors/conflict';
import { deleteVendorMessage } from '@/features/vendors/copy';
import { cleanVendorName, merchantKey } from '@/features/vendors/key';
import { getVendorIndex, useVendorIndex, useVendorsStore } from '@/features/vendors/store';
import { refreshVendors } from '@/features/vendors/sync';
import type { AliasConflict, Vendor, VendorAlias, VendorIndex } from '@/features/vendors/types';
import { haptics } from '@/lib/haptics';
import { colors } from '@/lib/theme';

/** The write that hit a conflict, so the sheet can re-run it after resolving. */
type PendingWrite = { kind: 'alias'; text: string } | { kind: 'rename'; text: string };

/** Vendor detail: rename · recognized names · (cards / list: later waves) · delete. */
export default function VendorDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const householdId = useAuthStore((s) => s.householdId);
  const loaded = useVendorsStore((s) => s.loaded);
  const index = useVendorIndex();
  const vendor = id ? index.byId.get(id) : undefined;
  const aliases = (id && index.aliasesByVendor.get(id)) || [];
  const listsByVendor = useListsByVendor();
  const shoppingList = id ? listsByVendor.get(id) : undefined;
  const listCounts = useListCounts();
  const [newListOpen, setNewListOpen] = useState(false);

  const [newAlias, setNewAlias] = useState('');
  const [aliasHint, setAliasHint] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [renameDraft, setRenameDraft] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);

  const [aliasToRemove, setAliasToRemove] = useState<VendorAlias | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [conflict, setConflict] = useState<AliasConflict | null>(null);
  const [pending, setPending] = useState<PendingWrite | null>(null);
  // The vendor at the moment the conflict opened (stays valid while the sheet animates out).
  const [conflictVendor, setConflictVendor] = useState<Vendor | null>(null);

  if (!vendor || !householdId) {
    if (!loaded || deleting) return <Screen>{null}</Screen>;
    return <NotFoundView message="Търговецът не е намерен." />;
  }

  const refresh = () => refreshVendors(householdId);

  /** Map a failed write to the conflict sheet (or an inline hint when it's our own name). */
  const handleWriteError = async (err: unknown, write: PendingWrite): Promise<boolean> => {
    if (!isUniqueViolation(err)) return false;
    let found = conflictFromError(err, write.text, getVendorIndex());
    if (!found) {
      await refresh().catch(() => {});
      found = conflictFromError(err, write.text, getVendorIndex());
    }
    if (!found) return false;
    if (found.owner.id === vendor.id) {
      setAliasHint('Вече е добавено');
      return true;
    }
    haptics.error();
    setPending(write);
    setConflictVendor(vendor);
    setConflict(found);
    return true;
  };

  const onAddAlias = async () => {
    const text = cleanVendorName(newAlias);
    if (!text || adding) return;
    const key = merchantKey(text);
    // Own name or own recognized name → no request.
    if (index.byKey.get(key)?.vendor.id === vendor.id) {
      setAliasHint('Вече е добавено');
      return;
    }
    setAdding(true);
    setAliasHint(null);
    try {
      await addAlias({ householdId, vendorId: vendor.id, alias: text, source: 'manual' });
      await refresh();
      haptics.tap();
      setNewAlias('');
    } catch (err) {
      if (await handleWriteError(err, { kind: 'alias', text })) {
        setNewAlias('');
      } else {
        haptics.error();
        Alert.alert('Грешка', 'Името не можа да бъде добавено. Опитай отново.');
      }
    } finally {
      setAdding(false);
    }
  };

  const onRename = async () => {
    if (renameDraft === null || renaming) return;
    const text = cleanVendorName(renameDraft);
    if (!text) return;
    if (text === vendor.name) {
      setRenameDraft(null);
      return;
    }
    setRenaming(true);
    try {
      await renameVendor(vendor.id, text);
      await refresh();
      setRenameDraft(null);
    } catch (err) {
      if (await handleWriteError(err, { kind: 'rename', text })) {
        setRenameDraft(null);
      } else {
        haptics.error();
        Alert.alert('Грешка', 'Търговецът не можа да бъде преименуван. Опитай отново.');
      }
    } finally {
      setRenaming(false);
    }
  };

  const onRemoveAlias = async () => {
    if (!aliasToRemove) return;
    const target = aliasToRemove;
    setAliasToRemove(null);
    try {
      await removeAlias(target.id);
      await refresh();
    } catch {
      haptics.error();
      Alert.alert('Грешка', 'Името не можа да бъде премахнато. Опитай отново.');
    }
  };

  const onDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteVendor(vendor.id);
      setConfirmDelete(false);
      router.back();
      await refresh().catch(() => {});
    } catch {
      setDeleting(false);
      haptics.error();
      Alert.alert('Грешка', 'Търговецът не можа да бъде изтрит. Опитай отново.');
    }
  };

  /** Re-run the conflicting write once the sheet has freed / moved the key. */
  const retry = async (fresh: VendorIndex) => {
    if (!pending) return;
    if (pending.kind === 'rename') {
      await renameVendor(vendor.id, pending.text);
      return;
    }
    // After a merge the key may already belong to this vendor.
    if (fresh.byKey.get(merchantKey(pending.text))?.vendor.id === vendor.id) return;
    await addAlias({ householdId, vendorId: vendor.id, alias: pending.text, source: 'manual' });
  };

  const closeConflict = () => {
    setConflict(null);
    setPending(null);
  };

  return (
    <Screen floatingAboveTabBar={
      <FloatingActionBar
        actions={[
          {
            label: 'Изтрий',
            icon: 'delete',
            variant: 'destructive',
            onPress: () => setConfirmDelete(true),
          },
        ]}
      />
    }>
      <ScreenHeader
        title={vendor.name}
        right={
          <Pressable
            onPress={() => setRenameDraft(vendor.name)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Преименувай"
            className="p-2">
            <MaterialIcons name="edit" size={20} color={colors.onSurfaceVariant} />
          </Pressable>
        }
      />

      {/* Recognized names */}
      <SectionLabel className="mb-sm">Разпознати имена</SectionLabel>
      {aliases.map((a) => (
        <AliasRow key={a.id} alias={a} onDelete={setAliasToRemove} />
      ))}
      <View className="mt-sm flex-row items-center gap-sm">
        <View className="flex-1">
          <FlatInput
            value={newAlias}
            onChangeText={(t) => {
              setNewAlias(t);
              setAliasHint(null);
            }}
            placeholder="Добави име…"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={onAddAlias}
            submitBehavior="submit"
          />
        </View>
        <Pressable
          onPress={onAddAlias}
          disabled={adding || cleanVendorName(newAlias) === ''}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Добави име"
          className={`p-2 ${adding || cleanVendorName(newAlias) === '' ? 'opacity-40' : ''}`}>
          <MaterialIcons name="add" size={22} color={colors.primaryContainer} />
        </Pressable>
      </View>
      {aliasHint ? (
        <Text className="mt-xs font-inter text-label-md text-on-surface-variant">{aliasHint}</Text>
      ) : null}

      {/*
        Loyalty cards ("Клиентски карти": CardTiles + "Добави карта") — the
        loyalty-cards wave renders that section here.
        Shopping list ("Списък за пазаруване" link) — the shopping-lists wave
        renders it here.
      */}
      <SectionLabel className="mb-xs mt-xl">Списък за пазаруване</SectionLabel>
      <Pressable
        onPress={() =>
          shoppingList
            ? router.push({ pathname: '/list/[id]', params: { id: shoppingList.id } })
            : setNewListOpen(true)
        }
        accessibilityRole="button"
        className="flex-row items-center justify-between py-md active:bg-white/5">
        <View className="flex-row items-center gap-3">
          <MaterialIcons
            name={shoppingList ? 'checklist' : 'playlist-add'}
            size={20}
            color={shoppingList ? colors.onSurfaceVariant : colors.primaryContainer}
          />
          <Text
            className={`font-inter text-body-lg ${
              shoppingList ? 'text-on-surface' : 'text-primary-container'
            }`}>
            {shoppingList
              ? listMetaLabel(
                  listCounts.get(shoppingList.id) ?? { total: 0, open: 0, done: 0 },
                )
              : 'Създай списък'}
          </Text>
        </View>
        {shoppingList ? (
          <MaterialIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
        ) : null}
      </Pressable>
      <NewListSheet
        visible={newListOpen}
        onClose={() => setNewListOpen(false)}
        initialVendorName={vendor.name}
      />

      {/* Rename */}
      <BottomSheet visible={renameDraft !== null} onClose={() => setRenameDraft(null)}>
        {renameDraft !== null ? (
          <View className="gap-lg px-6 pb-4 pt-2">
            <Text className="font-jakarta-medium text-headline-md text-on-surface">
              Преименувай
            </Text>
            <FlatInput
              value={renameDraft}
              onChangeText={setRenameDraft}
              placeholder="Име на търговеца"
              autoCapitalize="words"
              autoFocus
              onSubmitEditing={onRename}
            />
            <SheetActions
              actions={[
                {
                  label: 'Запази',
                  onPress: onRename,
                  variant: 'filled',
                  loading: renaming,
                  disabled: cleanVendorName(renameDraft) === '',
                },
                { label: 'Отказ', onPress: () => setRenameDraft(null), variant: 'ghost' },
              ]}
            />
          </View>
        ) : null}
      </BottomSheet>

      <ConfirmSheet
        visible={aliasToRemove !== null}
        title={`Премахване на „${aliasToRemove?.alias ?? ''}"?`}
        message="Това име вече няма да се разпознава автоматично."
        confirmLabel="Премахни"
        destructive
        onConfirm={onRemoveAlias}
        onCancel={() => setAliasToRemove(null)}
      />

      <ConfirmSheet
        visible={confirmDelete}
        title={`Изтриване на „${vendor.name}"?`}
        message={deleteVendorMessage(aliases.length)}
        confirmLabel={deleting ? 'Изтриване…' : 'Изтрий'}
        destructive
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      <VendorConflictSheet
        visible={conflict !== null}
        conflict={conflict}
        editingVendor={conflictVendor ?? vendor}
        retry={retry}
        refresh={refresh}
        onResolved={({ editingDeleted }) => {
          closeConflict();
          if (editingDeleted) {
            setDeleting(true);
            router.back();
          }
        }}
        onClose={closeConflict}
      />
    </Screen>
  );
}

// Route-level crash fallback — keeps the rest of the nav tree alive.
export { ScreenErrorFallback as ErrorBoundary } from '@/components/ScreenErrorFallback';

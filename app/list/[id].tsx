// app/list/[id].tsx — one shopping list: check-off, quick-add, card (spec §8.5–§8.7).
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackgroundGlow } from '@/components/BackgroundGlow';
import { BottomSheet } from '@/components/BottomSheet';
import { EmptyState } from '@/components/EmptyState';
import { FlatInput } from '@/components/FlatInput';
import { NotFoundView } from '@/components/NotFoundView';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionLabel } from '@/components/SectionLabel';
import { SheetActions } from '@/components/SheetActions';
import { useAuthStore } from '@/features/auth/store';
import { useHouseholdStore } from '@/features/household/store';
import { CardChip } from '@/features/loyalty/components/CardChip';
import { CardFormSheet } from '@/features/loyalty/components/CardFormSheet';
import { CardPickerSheet } from '@/features/loyalty/components/CardPickerSheet';
import { maskCode } from '@/features/loyalty/format';
import { useLoyaltyStore } from '@/features/loyalty/store';
import { useCardsForVendor } from '@/features/loyalty/sync';
import { ItemRow } from '@/features/shopping/components/ItemRow';
import { ListMenuSheet } from '@/features/shopping/components/ListMenuSheet';
import { ListProgress } from '@/features/shopping/components/ListProgress';
import { QuickAddBar } from '@/features/shopping/components/QuickAddBar';
import {
  addItemOptimistic,
  clearCheckedOptimistic,
  deleteListOptimistic,
  removeItemOptimistic,
  setListCardOptimistic,
  toggleItem,
  updateItemOptimistic,
} from '@/features/shopping/mutations';
import { listCounts, splitItems } from '@/features/shopping/order';
import { useShoppingStore } from '@/features/shopping/store';
import { useListItems, useShoppingList } from '@/features/shopping/sync';
import type { QuickAddDraft, ShoppingListItem } from '@/features/shopping/types';
import { useVendorIndex } from '@/features/vendors/store';
import { rowLayout } from '@/lib/animation';
import { haptics } from '@/lib/haptics';
import { colors } from '@/lib/theme';

/** How long a just-checked row stays put before it slides into "Взети" (decision #12). */
const SETTLE_MS = 450;
/** Stagger between rows leaving on "Изчисти взетите". */
const CLEAR_STAGGER_MS = 30;

type ScrollRef = { scrollToEnd: (opts?: { animated?: boolean }) => void } | null;

/** A ghost chip in the card row ("Избери карта" / "Добави карта"). */
function GhostChip({ icon, label, onPress }: { icon: 'add-card' | 'card-membership'; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-row items-center gap-xs self-start border border-white/10 px-3 py-1.5 active:bg-white/5"
      style={{ borderRadius: 9999 }}>
      <MaterialIcons name={icon} size={14} color={colors.onSurfaceVariant} />
      <Text className="font-inter-semibold text-label-md text-on-surface-variant">{label}</Text>
    </Pressable>
  );
}

export default function ShoppingListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const loaded = useShoppingStore((s) => s.loaded);
  const list = useShoppingList(id);
  const items = useListItems(id);
  const index = useVendorIndex();
  const allCards = useLoyaltyStore((s) => s.cards);
  const members = useHouseholdStore((s) => s.members);

  const vendorId = list?.vendor_id ?? null;
  const vendorCardsRaw = useCardsForVendor(vendorId);
  // `cardsForVendor(null)` means orphan cards — not "this list's vendor's cards".
  const vendorCards = vendorId ? vendorCardsRaw : [];
  const card = list?.loyalty_card_id
    ? allCards.find((c) => c.id === list.loyalty_card_id)
    : undefined;

  const [settling, setSettling] = useState<ReadonlySet<string>>(() => new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [clearing, setClearing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [barHeight, setBarHeight] = useState(64);
  const scroll = useRef<ScrollRef>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cardFormOpen, setCardFormOpen] = useState(false);
  const [editing, setEditing] = useState<ShoppingListItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editQty, setEditQty] = useState('');

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const counts = useMemo(() => listCounts(items), [items]);
  const { open, done } = useMemo(() => splitItems(items, settling), [items, settling]);

  const endSettle = useCallback((itemId: string) => {
    const timer = timers.current.get(itemId);
    if (timer) clearTimeout(timer);
    timers.current.delete(itemId);
    setSettling((prev) => {
      if (!prev.has(itemId)) return prev;
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
  }, []);

  if (!list) {
    if (!loaded || deleting) return <View className="flex-1 bg-background" />;
    return <NotFoundView message="Списъкът не е намерен." />;
  }

  const vendor = vendorId ? index.byId.get(vendorId) : undefined;
  const title = vendor?.name ?? list.name;

  const takenBy = (item: ShoppingListItem): string | null => {
    if (!item.checked_by || item.checked_by === userId) return null;
    return members.find((m) => m.userId === item.checked_by)?.displayName ?? null;
  };

  const onToggle = (item: ShoppingListItem) => {
    // Tap again while settling → undo, no regroup.
    if (settling.has(item.id)) {
      endSettle(item.id);
      haptics.select();
      void toggleItem(item.id, false, userId);
      return;
    }
    // Tap in "Взети" → back up into the open group, no settle delay.
    if (item.checked_at !== null) {
      haptics.select();
      void toggleItem(item.id, false, userId);
      return;
    }
    // One haptic per gesture: the last item taken gets `success` instead of `tap`.
    if (counts.open === 1) haptics.success();
    else haptics.tap();
    void toggleItem(item.id, true, userId).then((ok) => {
      if (!ok) endSettle(item.id);
    });
    setSettling((prev) => new Set(prev).add(item.id));
    timers.current.set(
      item.id,
      setTimeout(() => endSettle(item.id), SETTLE_MS),
    );
  };

  const onAdd = (draft: QuickAddDraft) => {
    haptics.tap();
    void addItemOptimistic(list.id, draft, userId);
    // Let the new row mount before scrolling to it.
    requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: true }));
  };

  const onDeleteItem = (item: ShoppingListItem) => {
    endSettle(item.id);
    void removeItemOptimistic(item.id);
  };

  const openEdit = (item: ShoppingListItem) => {
    haptics.select();
    setEditing(item);
    setEditName(item.name);
    setEditQty(item.quantity ?? '');
  };

  const onSaveEdit = () => {
    if (!editing) return;
    const name = editName.trim().replace(/\s+/g, ' ');
    if (!name) return;
    const quantity = editQty.trim() || null;
    if (name !== editing.name || quantity !== editing.quantity) {
      void updateItemOptimistic(editing.id, { name, quantity });
    }
    setEditing(null);
  };

  const onClearDone = () => {
    // Re-render the done rows with staggered exits first, then remove them.
    setClearing(true);
    requestAnimationFrame(() => {
      void clearCheckedOptimistic(list.id).finally(() => setClearing(false));
    });
  };

  const onDeleteList = () => {
    setDeleting(true);
    router.back();
    void deleteListOptimistic(list.id);
  };

  const onPickCard = (cardId: string | null) => {
    setPickerOpen(false);
    haptics.select();
    void setListCardOptimistic(list.id, cardId);
  };

  const cardRow = card ? (
    <View className="flex-row items-center gap-sm">
      <CardChip
        nickname={card.nickname}
        onPress={() => router.push({ pathname: '/card/[id]', params: { id: card.id } })}
      />
      <Text className="font-inter-medium text-label-md text-on-surface-variant opacity-70">
        {maskCode(card.code)}
      </Text>
    </View>
  ) : vendorCards.length > 0 ? (
    <GhostChip icon="card-membership" label="Избери карта" onPress={() => setPickerOpen(true)} />
  ) : vendorId ? (
    <GhostChip icon="add-card" label="Добави карта" onPress={() => setCardFormOpen(true)} />
  ) : null;

  const empty = items.length === 0;

  return (
    <View className="flex-1 bg-background">
      <BackgroundGlow />
      <SafeAreaView className="flex-1" edges={['top']}>
        <View className="px-md">
          <ScreenHeader
            title={title}
            right={
              <Pressable
                onPress={() => setMenuOpen(true)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Още"
                className="-mr-2 p-2">
                <MaterialIcons name="more-vert" size={24} color={colors.onSurfaceVariant} />
              </Pressable>
            }
          />
          <View className="mb-md gap-md">
            {empty ? null : <ListProgress counts={counts} />}
            {cardRow}
          </View>
        </View>

        <KeyboardAwareScrollView
          ref={(r: ScrollRef) => {
            scroll.current = r;
          }}
          style={{ flex: 1 }}
          bottomOffset={barHeight + 16}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: barHeight + 16 }}
          showsVerticalScrollIndicator={false}>
          {empty ? (
            <EmptyState
              icon="shopping-cart"
              title="Списъкът е празен"
              message="Добави първия продукт отдолу."
            />
          ) : (
            // One flat sibling list (open rows, label, done rows) so a row that
            // regroups keeps its key and the layout transition slides it.
            <View>
              {open.map((item, i) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  checked={item.checked_at !== null}
                  onToggle={onToggle}
                  onDelete={onDeleteItem}
                  onLongPress={openEdit}
                  showDivider={i < open.length - 1}
                />
              ))}
              {done.length > 0 ? (
                <Animated.View key="done-label" entering={FadeIn} layout={rowLayout} className="mb-xs mt-lg">
                  <SectionLabel>{`Взети (${done.length})`}</SectionLabel>
                </Animated.View>
              ) : null}
              {done.map((item, i) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  checked
                  takenBy={takenBy(item)}
                  onToggle={onToggle}
                  onDelete={onDeleteItem}
                  onLongPress={openEdit}
                  exitDelay={clearing ? i * CLEAR_STAGGER_MS : 0}
                  showDivider={i < done.length - 1}
                />
              ))}
            </View>
          )}
        </KeyboardAwareScrollView>
      </SafeAreaView>

      <QuickAddBar onSubmit={onAdd} onHeight={setBarHeight} />

      <ListMenuSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        listName={title}
        doneCount={counts.done}
        cards={vendorCards}
        currentCardId={list.loyalty_card_id}
        onPickCard={(cardId) => {
          haptics.select();
          void setListCardOptimistic(list.id, cardId);
        }}
        onClearDone={onClearDone}
        onDelete={onDeleteList}
      />

      <CardPickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        cards={vendorCards}
        selectedId={list.loyalty_card_id}
        onSelect={onPickCard}
      />

      <CardFormSheet
        visible={cardFormOpen}
        initialVendorId={vendorId}
        onClose={() => setCardFormOpen(false)}
        onSaved={(cardId) => {
          haptics.success();
          void setListCardOptimistic(list.id, cardId);
        }}
      />

      {/* Long-press → edit name / quantity. */}
      <BottomSheet visible={editing !== null} onClose={() => setEditing(null)}>
        <View className="gap-lg px-6 pb-4 pt-2">
          <Text className="font-jakarta-medium text-headline-md text-on-surface">Продукт</Text>
          <View className="gap-md">
            <FlatInput
              value={editName}
              onChangeText={setEditName}
              placeholder="Име"
              autoFocus
              onSubmitEditing={onSaveEdit}
            />
            <FlatInput
              value={editQty}
              onChangeText={setEditQty}
              placeholder="Количество (по желание)"
              onSubmitEditing={onSaveEdit}
            />
          </View>
          <SheetActions
            actions={[
              {
                label: 'Запази',
                onPress: onSaveEdit,
                variant: 'filled',
                disabled: editName.trim() === '',
              },
              { label: 'Отказ', onPress: () => setEditing(null), variant: 'ghost' },
            ]}
          />
        </View>
      </BottomSheet>
    </View>
  );
}

// Route-level crash fallback — keeps the rest of the nav tree alive.
export { ScreenErrorFallback as ErrorBoundary } from '@/components/ScreenErrorFallback';

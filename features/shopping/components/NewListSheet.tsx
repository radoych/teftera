// features/shopping/components/NewListSheet.tsx — vendor → card → create or open (spec §8.8).
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { BottomSheet } from '@/components/BottomSheet';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { useAuthStore } from '@/features/auth/store';
import { CardPicker } from '@/features/loyalty/components/CardPickerSheet';
import { cardsForVendor } from '@/features/loyalty/group';
import { useLoyaltyStore } from '@/features/loyalty/store';
import type { LoyaltyCard } from '@/features/loyalty/types';
import { createVendor } from '@/features/vendors/api';
import { VendorAutocomplete } from '@/features/vendors/components/VendorAutocomplete';
import { ensureVendorForMerchant } from '@/features/vendors/ensure';
import { cleanVendorName } from '@/features/vendors/key';
import { getVendorIndex } from '@/features/vendors/store';
import { refreshVendors } from '@/features/vendors/sync';
import { cardChoice } from '../create';
import { openOrCreateVendorList } from '../mutations';
import { useShoppingStore } from '../store';

export interface NewListSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Prefill the vendor field (e.g. from a vendor's detail screen). */
  initialVendorName?: string;
}

/** Resolved vendor waiting for a card choice. */
type PickStep = { vendorId: string; name: string; cards: LoyaltyCard[] };

const FAILED = 'Неуспешно. Опитай отново.';

const openList = (id: string) => router.push({ pathname: '/list/[id]', params: { id } });

/**
 * Pick (or type) a store, then: its existing list opens (one list per vendor);
 * otherwise a list is created with the vendor's only card attached — or, with
 * several cards, the sheet crossfades to "Коя карта?" first.
 */
export function NewListSheet(props: NewListSheetProps) {
  return (
    <BottomSheet visible={props.visible} onClose={props.onClose}>
      {/* The sheet mounts its panel only while open, so every open starts fresh. */}
      <NewListForm {...props} />
    </BottomSheet>
  );
}

function NewListForm({ onClose, initialVendorName = '' }: NewListSheetProps) {
  const householdId = useAuthStore((s) => s.householdId);
  const allCards = useLoyaltyStore((s) => s.cards);
  const [text, setText] = useState(initialVendorName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<PickStep | null>(null);

  const cardCount = (vendorId: string) => allCards.filter((c) => c.vendor_id === vendorId).length;

  const create = async (vendorId: string, name: string, loyaltyCardId: string | null) => {
    const { id, created } = await openOrCreateVendorList({ vendorId, name, loyaltyCardId });
    onClose();
    openList(id);
  };

  const onContinue = async () => {
    if (busy || !householdId || cleanVendorName(text) === '') return;
    setBusy(true);
    setError(null);
    try {
      const vendor = await ensureVendorForMerchant(
        { householdId, merchant: text, index: getVendorIndex() },
        { createVendor, refreshVendors, getIndex: getVendorIndex },
      );
      if (!vendor.vendorId) throw new Error('vendor could not be resolved');

      // Decision #8 — a vendor's list is reused, never duplicated.
      const existing = useShoppingStore
        .getState()
        .lists.find((l) => l.vendor_id === vendor.vendorId);
      if (existing) {
        onClose();
        openList(existing.id);
        return;
      }

      const cards = cardsForVendor(useLoyaltyStore.getState().cards, vendor.vendorId);
      const choice = cardChoice(cards);
      if (choice.kind === 'pick') {
        setPick({ vendorId: vendor.vendorId, name: vendor.name, cards });
        return;
      }
      await create(vendor.vendorId, vendor.name, choice.cardId);
    } catch (err) {
      if (__DEV__) console.warn('[shopping] new list failed', err);
      setError(FAILED);
    } finally {
      setBusy(false);
    }
  };

  const onPickCard = async (cardId: string | null) => {
    if (!pick || busy) return;
    setBusy(true);
    setError(null);
    try {
      await create(pick.vendorId, pick.name, cardId);
    } catch (err) {
      if (__DEV__) console.warn('[shopping] new list failed', err);
      setError(FAILED);
    } finally {
      setBusy(false);
    }
  };

  if (pick) {
    return (
      <Animated.View key="pick" entering={FadeIn.duration(160)}>
        <CardPicker cards={pick.cards} onSelect={onPickCard} />
        {error ? <Text className="px-6 pb-4 font-inter text-body-md text-error">{error}</Text> : null}
      </Animated.View>
    );
  }

  return (
    <Animated.View key="vendor" entering={FadeIn.duration(160)} className="gap-lg px-6 pb-4 pt-2">
      <Text className="font-jakarta-medium text-headline-md text-on-surface">Нов списък</Text>
      <View className="gap-sm">
        <VendorAutocomplete
          value={text}
          onChangeText={(t) => {
            setText(t);
            setError(null);
          }}
          placeholder="Магазин"
          autoFocus
          cardCount={cardCount}
        />
        {error ? <Text className="font-inter text-body-md text-error">{error}</Text> : null}
      </View>
      <FloatingActionBar inline
        actions={[
          {
            label: 'Продължи', icon: 'arrow-forward',
            onPress: onContinue,
            variant: 'filled',
            loading: busy,
            disabled: cleanVendorName(text) === '',
          },
          { label: 'Отказ', icon: 'close', onPress: onClose, variant: 'ghost', disabled: busy },
        ]}
      />
    </Animated.View>
  );
}

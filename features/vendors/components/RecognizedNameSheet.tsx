// features/vendors/components/RecognizedNameSheet.tsx — "this merchant is a recognized name of …".
import { useState } from 'react';
import { Text, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { useCardCount } from '@/features/loyalty/sync';
import { aliasAction, pickAliasTarget } from '../aliasAction';
import { addAlias, createVendor } from '../api';
import { conflictFromError, isUniqueViolation } from '../conflict';
import { ensureVendorForMerchant } from '../ensure';
import { getVendorIndex, useVendorIndex } from '../store';
import { refreshVendors } from '../sync';
import type { AliasConflict, Vendor } from '../types';
import { VendorAutocomplete } from './VendorAutocomplete';

export interface RecognizedNameSheetProps {
  visible: boolean;
  householdId: string;
  /** The raw merchant to file under a vendor. */
  merchant: string;
  onClose: () => void;
  /**
   * Another vendor already holds the name (as a recognized name or as its own
   * name): hand over to the conflict sheet, with `target` as the vendor the
   * user was filing it under.
   */
  onConflict: (conflict: AliasConflict, target: Vendor) => void;
}

const FAILED = 'Неуспешно. Опитай отново.';

/**
 * Pick (or type) a vendor and add `merchant` as one of its recognized names.
 * A typed name that matches nothing creates that vendor first.
 */
export function RecognizedNameSheet(props: RecognizedNameSheetProps) {
  return (
    <BottomSheet visible={props.visible} onClose={props.onClose}>
      {/* The sheet mounts its panel only while open, so every open starts fresh. */}
      <RecognizedNameForm {...props} />
    </BottomSheet>
  );
}

function RecognizedNameForm({
  householdId,
  merchant,
  onClose,
  onConflict,
}: RecognizedNameSheetProps) {
  const index = useVendorIndex();
  const cardCount = useCardCount();
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<Vendor | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = pickAliasTarget(text, selected, index);
  const already =
    target.kind === 'existing' &&
    aliasAction(merchant, target.vendor, index).kind === 'already'
      ? target.vendor
      : null;

  /** The picked vendor, creating it when the typed name is new. */
  const resolveTarget = async (): Promise<Vendor> => {
    if (target.kind === 'existing') return target.vendor;
    if (target.kind !== 'new') throw new Error('no vendor');
    const ensured = await ensureVendorForMerchant(
      { householdId, merchant: target.name, index: getVendorIndex() },
      { createVendor, refreshVendors, getIndex: getVendorIndex },
    );
    if (!ensured.vendorId) throw new Error('vendor could not be created');
    await refreshVendors(householdId);
    const vendor = getVendorIndex().byId.get(ensured.vendorId);
    if (!vendor) throw new Error('created vendor not loaded');
    return vendor;
  };

  /** Hand a conflict over; the sheet closes so the conflict sheet can open. */
  const conflictOut = (conflict: AliasConflict, vendor: Vendor) => {
    onClose();
    onConflict(conflict, vendor);
  };

  const onConfirm = async () => {
    if (busy || already || target.kind === 'none') return;
    setBusy(true);
    setError(null);
    try {
      const vendor = await resolveTarget();
      const action = aliasAction(merchant, vendor, getVendorIndex());
      if (action.kind === 'invalid') throw new Error('blank merchant');
      if (action.kind === 'conflict') {
        conflictOut(action.conflict, vendor);
        return;
      }
      if (action.kind === 'add') {
        try {
          await addAlias({
            householdId,
            vendorId: vendor.id,
            alias: action.alias,
            source: 'manual',
          });
        } catch (err) {
          // Raced with the other phone: someone else took the name meanwhile.
          if (!isUniqueViolation(err)) throw err;
          await refreshVendors(householdId).catch(() => {});
          const conflict = conflictFromError(err, action.alias, getVendorIndex());
          if (conflict && conflict.owner.id !== vendor.id) {
            conflictOut(conflict, vendor);
            return;
          }
          if (!conflict) throw err;
        }
      }
      await refreshVendors(householdId).catch(() => {});
      onClose();
    } catch (err) {
      if (__DEV__) console.warn('[vendors] recognized name failed', err);
      setError(FAILED);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-lg px-6 pb-4 pt-2">
      <View className="gap-sm">
        <Text className="font-jakarta-medium text-headline-md text-on-surface">
          Разпознато име
        </Text>
        <Text className="font-inter text-body-md text-on-surface-variant">
          {`„${merchant}“ е разпознато име на:`}
        </Text>
      </View>
      <View className="gap-sm">
        <VendorAutocomplete
          value={text}
          onChangeText={(t) => {
            setText(t);
            setSelected(null);
            setError(null);
          }}
          onSelect={setSelected}
          placeholder="Търговец"
          autoFocus
          cardCount={cardCount}
        />
        {already ? (
          <Text className="font-inter text-label-md text-on-surface-variant">
            {`Вече е разпознато име на „${already.name}“.`}
          </Text>
        ) : target.kind === 'new' ? (
          <Text className="font-inter text-label-md text-on-surface-variant opacity-70">
            {`Ще бъде създаден нов търговец „${target.name}“.`}
          </Text>
        ) : null}
        {error ? (
          <Text className="font-inter text-body-md text-error">{error}</Text>
        ) : null}
      </View>
      <FloatingActionBar inline
        actions={[
          {
            label: 'Запази', icon: 'check',
            onPress: onConfirm,
            variant: 'filled',
            loading: busy,
            disabled: target.kind === 'none' || already !== null,
          },
          { label: 'Отказ', icon: 'close', onPress: onClose, variant: 'ghost', disabled: busy },
        ]}
      />
    </View>
  );
}

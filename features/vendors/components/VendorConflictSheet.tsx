// features/vendors/components/VendorConflictSheet.tsx — the five-way "name already used" flow.
import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { SheetActions } from '@/components/SheetActions';
import { refreshLoyaltyCards, useCardCount } from '@/features/loyalty/sync';
import { haptics } from '@/lib/haptics';
import { colors } from '@/lib/theme';
import { deleteVendor, mergeVendors, moveAlias } from '../api';
import { aliasCountLabel, cardCountLabel } from '../copy';
import {
  conflictOptions,
  isDestructiveOption,
  resolveConflict,
  type ConflictOption,
} from '../resolution';
import { getVendorIndex, useVendorIndex } from '../store';
import type { AliasConflict, Vendor, VendorIndex } from '../types';

export interface VendorConflictSheetProps {
  visible: boolean;
  conflict: AliasConflict | null;
  /** The vendor the user was working on. */
  editingVendor: Vendor;
  /** Re-run the write that conflicted, against the refreshed index. */
  retry: (index: VendorIndex) => Promise<void>;
  /** Reload vendors + aliases (awaited between steps). */
  refresh: () => Promise<void>;
  /** Resolved; `editingDeleted` → the detail screen should go back. */
  onResolved: (result: { editingDeleted: boolean }) => void;
  onClose: () => void;
}

function optionCopy(option: ConflictOption, c: AliasConflict, editing: Vendor) {
  const a = c.owner.name;
  const b = editing.name;
  switch (option) {
    case 'merge':
      return {
        label: `Обедини „${a}" в „${b}"`,
        description: `Всички имена, карти и списъкът на „${a}" минават към „${b}".`,
        recommended: true,
      };
    case 'move':
      return {
        label: 'Премести само това име',
        description: `Само „${c.attemptedAlias}" минава към „${b}".`,
        recommended: false,
      };
    case 'deleteOwner':
      return {
        label: `Изтрий „${a}"`,
        description:
          'Търговецът и всичките му разпознати имена се изтриват. Картите и списъкът остават без търговец.',
        recommended: false,
      };
    case 'deleteEditing':
      return {
        label: `Изтрий „${b}"`,
        description:
          'Търговецът и всичките му разпознати имена се изтриват. Картите и списъкът остават без търговец.',
        recommended: false,
      };
    case 'deleteBoth':
      return {
        label: 'Изтрий и двата',
        description:
          'Двата търговеца и всичките им имена се изтриват. Картите и списъците остават без търговец.',
        recommended: false,
      };
  }
}

/** One side of the side-by-side summary. The list flag arrives with phase 3. */
function VendorSummary({
  vendor,
  index,
  cards,
}: {
  vendor: Vendor;
  index: VendorIndex;
  cards: number;
}) {
  const aliases = index.aliasesByVendor.get(vendor.id)?.length ?? 0;
  return (
    <View className="flex-1 gap-xs py-sm">
      <Text className="font-inter-semibold text-body-md text-on-surface" numberOfLines={2}>
        {vendor.name}
      </Text>
      <Text className="font-inter text-label-md text-on-surface-variant opacity-70">
        {aliasCountLabel(aliases)}
      </Text>
      <Text className="font-inter text-label-md text-on-surface-variant opacity-70">
        {cardCountLabel(cards)}
      </Text>
      {/* Shopping-list summary line: added by the shopping wave. */}
    </View>
  );
}

export function VendorConflictSheet({
  visible,
  conflict,
  editingVendor,
  retry,
  refresh,
  onResolved,
  onClose,
}: VendorConflictSheetProps) {
  const index = useVendorIndex();
  const cardCount = useCardCount();
  const [selected, setSelected] = useState<ConflictOption>('merge');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh state each time a new conflict opens.
  useEffect(() => {
    if (!visible) return;
    setSelected('merge');
    setError(null);
    setBusy(false);
  }, [visible, conflict]);

  const onConfirm = async () => {
    if (!conflict || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await resolveConflict(
        selected,
        { conflict, editing: editingVendor, retry },
        { mergeVendors, moveAlias, deleteVendor, refresh, getIndex: getVendorIndex },
      );
      // Merge moved the owner's cards; deletes left orphans (spec §1 #7) — reload them.
      await refreshLoyaltyCards(editingVendor.household_id).catch(() => {});
      haptics.success();
      onResolved(result);
    } catch (err) {
      if (__DEV__) console.warn('[vendors] conflict resolution failed', err);
      haptics.error();
      setError('Неуспешно. Опитай отново.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={busy ? () => {} : onClose}>
      {conflict ? (
        <View className="gap-md px-6 pb-4 pt-2">
          <Text className="font-jakarta-medium text-headline-md text-on-surface">
            Името вече се използва
          </Text>
          <Text className="font-inter text-body-md text-on-surface-variant">
            {`„${conflict.attemptedAlias}" вече принадлежи на `}
            <Text className="font-inter-semibold text-on-surface">{conflict.owner.name}</Text>
            {'. Избери как да продължиш:'}
          </Text>

          <View className="flex-row gap-md" style={styles.summaryRow}>
            <VendorSummary
              vendor={conflict.owner}
              index={index}
              cards={cardCount(conflict.owner.id)}
            />
            <View style={styles.vRule} />
            <VendorSummary
              vendor={editingVendor}
              index={index}
              cards={cardCount(editingVendor.id)}
            />
          </View>

          <View>
            {conflictOptions(conflict).map((option) => {
              const copy = optionCopy(option, conflict, editingVendor);
              const active = option === selected;
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    if (option !== selected) haptics.select();
                    setSelected(option);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  className="flex-row items-center gap-md py-sm active:bg-white/5"
                  style={styles.optionDivider}>
                  <View className="flex-1 gap-0.5">
                    <Text className="font-inter-medium text-body-md text-on-surface">
                      {copy.label}
                      {copy.recommended ? (
                        <Text className="font-inter text-label-md text-on-surface-variant">
                          {'  препоръчано'}
                        </Text>
                      ) : null}
                    </Text>
                    <Text className="font-inter text-label-md text-on-surface-variant opacity-70">
                      {copy.description}
                    </Text>
                  </View>
                  <View className="w-6 items-center">
                    {active ? (
                      <MaterialIcons name="check" size={20} color={colors.primaryContainer} />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {error ? <Text className="font-inter text-body-md text-error">{error}</Text> : null}

          <SheetActions
            actions={[
              {
                label: 'Потвърди',
                onPress: onConfirm,
                variant: isDestructiveOption(selected) ? 'destructive' : 'filled',
                loading: busy,
              },
              { label: 'Отказ', onPress: onClose, variant: 'ghost', disabled: busy },
            ]}
          />
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  summaryRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  vRule: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
  },
  optionDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
});

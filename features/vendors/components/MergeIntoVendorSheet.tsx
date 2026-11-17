// features/vendors/components/MergeIntoVendorSheet.tsx — "this vendor is really that one".
import { useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { BottomSheet } from '@/components/BottomSheet';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { useCardCount } from '@/features/loyalty/sync';
import { useListsByVendor } from '@/features/shopping/sync';
import { pickAliasTarget } from '../aliasAction';
import { mergeVendors } from '../api';
import { mergeIntoLines } from '../copy';
import { useVendorIndex } from '../store';
import type { Vendor } from '../types';
import { VendorAutocomplete } from './VendorAutocomplete';

export interface MergeIntoVendorSheetProps {
  visible: boolean;
  /** The vendor that becomes recognized names of the picked one. */
  source: Vendor;
  onClose: () => void;
  /** The merge succeeded; the caller refreshes and navigates to the target. */
  onMerged: (target: Vendor) => void;
}

/**
 * Pick an existing vendor, confirm the consequences, then
 * `merge_vendors(source, target)`: the source's name and recognized names
 * become the target's, its cards and list move over, and it is deleted.
 */
export function MergeIntoVendorSheet(props: MergeIntoVendorSheetProps) {
  return (
    <BottomSheet visible={props.visible} onClose={props.onClose}>
      {/* The sheet mounts its panel only while open, so every open starts fresh. */}
      <MergeIntoForm {...props} />
    </BottomSheet>
  );
}

function MergeIntoForm({ source, onClose, onMerged }: MergeIntoVendorSheetProps) {
  const index = useVendorIndex();
  const cardCount = useCardCount();
  const listsByVendor = useListsByVendor();
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<Vendor | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = pickAliasTarget(text, selected, index, source.id);
  const hint =
    target.kind === 'new'
      ? 'Избери съществуващ търговец.'
      : target.kind === 'self'
        ? 'Избери друг търговец.'
        : null;

  if (confirming && target.kind === 'existing') {
    const to = target.vendor;
    const lines = mergeIntoLines({
      source: source.name,
      target: to.name,
      aliases: index.aliasesByVendor.get(source.id)?.length ?? 0,
      cards: cardCount(source.id),
      sourceHasList: listsByVendor.has(source.id),
      targetHasList: listsByVendor.has(to.id),
    });

    const onConfirm = async () => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        await mergeVendors(source.id, to.id);
        onMerged(to);
      } catch (err) {
        if (__DEV__) console.warn('[vendors] merge into failed', err);
        setError('Неуспешно обединяване. Опитай отново.');
        setBusy(false);
      }
    };

    return (
      <Animated.View
        key="confirm"
        entering={FadeIn.duration(160)}
        className="gap-lg px-6 pb-4 pt-2"
      >
        <Text className="font-jakarta-medium text-headline-md text-on-surface">
          {`Обедини в „${to.name}“?`}
        </Text>
        <View className="gap-sm">
          {lines.map((line) => (
            <Text key={line} className="font-inter text-body-md text-on-surface-variant">
              {line}
            </Text>
          ))}
        </View>
        {error ? (
          <Text className="font-inter text-body-md text-error">{error}</Text>
        ) : null}
        <FloatingActionBar inline
          actions={[
            { label: 'Обедини', icon: 'call-merge', onPress: onConfirm, variant: 'filled', loading: busy },
            {
              label: 'Назад', icon: 'arrow-back',
              onPress: () => {
                setConfirming(false);
                setError(null);
              },
              variant: 'ghost',
              disabled: busy,
            },
          ]}
        />
      </Animated.View>
    );
  }

  return (
    <Animated.View
      key="pick"
      entering={FadeIn.duration(160)}
      className="gap-lg px-6 pb-4 pt-2"
    >
      <View className="gap-sm">
        <Text className="font-jakarta-medium text-headline-md text-on-surface">
          Разпознато име на…
        </Text>
        <Text className="font-inter text-body-md text-on-surface-variant">
          {`„${source.name}“ и разпознатите му имена ще станат разпознати имена на избрания търговец.`}
        </Text>
      </View>
      <View className="gap-sm">
        <VendorAutocomplete
          value={text}
          onChangeText={(t) => {
            setText(t);
            setSelected(null);
          }}
          onSelect={setSelected}
          placeholder="Търговец"
          autoFocus
          excludeVendorId={source.id}
          cardCount={cardCount}
        />
        {hint ? (
          <Text className="font-inter text-label-md text-on-surface-variant">{hint}</Text>
        ) : null}
      </View>
      <FloatingActionBar inline
        actions={[
          {
            label: 'Продължи', icon: 'arrow-forward',
            onPress: () => {
              setConfirming(true);
            },
            variant: 'filled',
            disabled: target.kind !== 'existing',
          },
          { label: 'Отказ', icon: 'close', onPress: onClose, variant: 'ghost' },
        ]}
      />
    </Animated.View>
  );
}

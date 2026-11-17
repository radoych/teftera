import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { BottomSheet } from '@/components/BottomSheet';
import { CollapsingHeaderScreen } from '@/components/CollapsingHeader';
import { EmptyState } from '@/components/EmptyState';
import { FlatInput } from '@/components/FlatInput';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { useAuthStore } from '@/features/auth/store';
import { useCardCount } from '@/features/loyalty/sync';
import { useListsByVendor } from '@/features/shopping/sync';
import { createVendor } from '@/features/vendors/api';
import { conflictFromError, isUniqueViolation } from '@/features/vendors/conflict';
import { vendorCountLabel, vendorMetaLine } from '@/features/vendors/copy';
import { cleanVendorName } from '@/features/vendors/key';
import { filterVendors } from '@/features/vendors/resolve';
import {
  getVendorIndex,
  useVendorIndex,
  useVendorsStore,
} from '@/features/vendors/store';
import { refreshVendors } from '@/features/vendors/sync';
import type { Vendor } from '@/features/vendors/types';
import { rowEntering, rowExiting, rowLayout } from '@/lib/animation';
import { colors } from '@/lib/theme';

function VendorRow({ vendor, meta }: { vendor: Vendor; meta: string }) {
  return (
    <Animated.View
      entering={rowEntering}
      exiting={rowExiting}
      layout={rowLayout}
      style={styles.divider}
    >
      <Pressable
        onPress={() =>
          router.push({ pathname: '/vendor/[id]', params: { id: vendor.id } })
        }
        accessibilityRole="button"
        className="flex-row items-center gap-md py-md active:bg-white/5"
      >
        <View className="flex-1">
          <Text className="font-inter text-body-lg text-on-surface" numberOfLines={1}>
            {vendor.name}
          </Text>
          {meta ? (
            <Text className="font-inter text-label-md text-on-surface-variant opacity-60">
              {meta}
            </Text>
          ) : null}
        </View>
        <MaterialIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
      </Pressable>
    </Animated.View>
  );
}

/** Profile → Търговци: the household's vendors, searchable by name and recognized names. */
export default function VendorsScreen() {
  const householdId = useAuthStore((s) => s.householdId);
  const loaded = useVendorsStore((s) => s.loaded);
  const index = useVendorIndex();
  const cardCount = useCardCount();
  const listsByVendor = useListsByVendor();

  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draftHint, setDraftHint] = useState<string | null>(null);
  /** Vendor that already holds the typed name — the hint links to it. */
  const [ownerId, setOwnerId] = useState<string | null>(null);

  const visible = useMemo(() => filterVendors(query, index), [query, index]);
  const total = index.byId.size;

  const closeDraft = () => {
    setDraft(null);
    setDraftHint(null);
    setOwnerId(null);
  };

  const onCreate = async () => {
    if (draft === null || saving || !householdId) return;
    const name = cleanVendorName(draft);
    if (!name) return;
    setSaving(true);
    setDraftHint(null);
    try {
      const { id } = await createVendor({ householdId, name });
      await refreshVendors(householdId);
      closeDraft();
      router.push({ pathname: '/vendor/[id]', params: { id } });
    } catch (err) {
      // The typed name is already a vendor or someone's recognized name.
      // There is no "editing" vendor yet to merge into, so point at the owner.
      // The local index may not know the owner yet (the other phone just
      // wrote it): refresh once and look again.
      let conflict = conflictFromError(err, name, getVendorIndex());
      if (!conflict && isUniqueViolation(err)) {
        await refreshVendors(householdId).catch(() => {});
        conflict = conflictFromError(err, name, getVendorIndex());
      }
      if (conflict) {
        setDraftHint(
          conflict.ownerAlias.is_primary
            ? `„${conflict.owner.name}" вече съществува.`
            : `„${name}" вече е разпознато име на „${conflict.owner.name}".`,
        );
        setOwnerId(conflict.owner.id);
      } else {
        Alert.alert('Грешка', 'Търговецът не можа да бъде записан. Опитай отново.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <CollapsingHeaderScreen
      title="Търговци"
      subtitle={total > 0 ? vendorCountLabel(total) : null}
      back
    >
      {({ scrollProps, largeTitle }) => (
        <>
          <Animated.ScrollView {...scrollProps}>
            {largeTitle}

            {total > 0 ? (
              <View className="mb-md">
                <FlatInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Търси търговец…"
                  autoCorrect={false}
                  returnKeyType="search"
                />
              </View>
            ) : null}

            {loaded && total === 0 ? (
              <EmptyState
                icon="storefront"
                title="Няма търговци още"
                message="Появяват се автоматично при записване на транзакции."
              />
            ) : null}

            {visible.map((v) => (
              <VendorRow
                key={v.id}
                vendor={v}
                meta={vendorMetaLine({
                  aliases: index.aliasesByVendor.get(v.id)?.length ?? 0,
                  cards: cardCount(v.id),
                  hasList: listsByVendor.has(v.id),
                })}
              />
            ))}

            <Pressable
              onPress={() => setDraft('')}
              className="flex-row items-center gap-3 py-5 active:opacity-70"
            >
              <MaterialIcons name="add" size={20} color={colors.primaryContainer} />
              <Text className="font-inter text-body-md text-primary-container">
                Нов търговец
              </Text>
            </Pressable>
          </Animated.ScrollView>

          <BottomSheet visible={draft !== null} onClose={closeDraft}>
            {draft !== null ? (
              <View className="gap-lg px-6 pb-4 pt-2">
                <Text className="font-jakarta-medium text-headline-md text-on-surface">
                  Нов търговец
                </Text>
                <View className="gap-sm">
                  <FlatInput
                    value={draft}
                    onChangeText={(t) => {
                      setDraft(t);
                      setDraftHint(null);
                    }}
                    placeholder="Име на търговеца"
                    autoCapitalize="words"
                    autoFocus
                    onSubmitEditing={onCreate}
                  />
                  {draftHint ? (
                    <Pressable
                      onPress={() => {
                        if (!ownerId) return;
                        closeDraft();
                        router.push({
                          pathname: '/vendor/[id]',
                          params: { id: ownerId },
                        });
                      }}
                      className="active:opacity-70"
                    >
                      <Text className="font-inter text-body-md text-error">
                        {draftHint}
                      </Text>
                      <Text className="font-inter text-label-md text-primary-container">
                        Отвори търговеца
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                <FloatingActionBar inline
                  actions={[
                    {
                      label: 'Запази', icon: 'check',
                      onPress: onCreate,
                      variant: 'filled',
                      loading: saving,
                      disabled: cleanVendorName(draft) === '',
                    },
                    { label: 'Отказ', icon: 'close', onPress: closeDraft, variant: 'ghost' },
                  ]}
                />
              </View>
            ) : null}
          </BottomSheet>
        </>
      )}
    </CollapsingHeaderScreen>
  );
}

const styles = StyleSheet.create({
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
});

// Route-level crash fallback — keeps the rest of the nav tree alive.
export { ScreenErrorFallback as ErrorBoundary } from '@/components/ScreenErrorFallback';

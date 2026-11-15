import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { EmptyState } from '@/components/EmptyState';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionLabel } from '@/components/SectionLabel';
import { CardFormSheet } from '@/features/loyalty/components/CardFormSheet';
import { CardTile } from '@/features/loyalty/components/CardTile';
import { groupCardsByVendor } from '@/features/loyalty/group';
import { useLoyaltyStore } from '@/features/loyalty/store';
import type { LoyaltyCard } from '@/features/loyalty/types';
import { useVendorNameLookup } from '@/features/loyalty/vendorNames';
import { rowEntering, rowLayout } from '@/lib/animation';

/** Screen side padding (Screen) and the grid gap (gap-md). */
const GUTTER = 16;
const GAP = 16;

/** All household cards, grouped by vendor (alphabetical), "Без търговец" last. */
export default function LoyaltyCardsScreen() {
  const cards = useLoyaltyStore((s) => s.cards);
  const loaded = useLoyaltyStore((s) => s.loaded);
  const vendorName = useVendorNameLookup();
  const { width } = useWindowDimensions();
  const tileWidth = Math.floor((width - GUTTER * 2 - GAP) / 2);

  /** undefined = sheet closed, null = new card, card = edit. */
  const [editing, setEditing] = useState<LoyaltyCard | null | undefined>(undefined);

  const groups = useMemo(() => groupCardsByVendor(cards, vendorName), [cards, vendorName]);

  return (
    <Screen
      floatingAboveTabBar={
        <FloatingActionBar
          actions={[
            {
              label: 'Нова карта',
              icon: 'add-card',
              variant: 'filled',
              onPress: () => setEditing(null),
            },
          ]}
        />
      }>
      <ScreenHeader title="Клиентски карти" />

      {loaded && cards.length === 0 ? (
        <EmptyState
          icon="card-membership"
          title="Няма клиентски карти"
          message="Добави карта и я показвай на касата с едно докосване."
        />
      ) : null}

      {groups.map((group) => (
        <View key={group.key} className="mb-lg">
          <SectionLabel className="mb-sm">{group.title}</SectionLabel>
          <View className="flex-row flex-wrap gap-md">
            {group.cards.map((card) => (
              <Animated.View key={card.id} entering={rowEntering} layout={rowLayout}>
                <CardTile
                  card={card}
                  vendorName={group.vendorId ? group.title : undefined}
                  width={tileWidth}
                  onPress={() => router.push(`/card/${card.id}`)}
                  onLongPress={() => setEditing(card)}
                />
              </Animated.View>
            ))}
          </View>
        </View>
      ))}

      <CardFormSheet
        visible={editing !== undefined}
        card={editing ?? null}
        onClose={() => setEditing(undefined)}
      />
    </Screen>
  );
}

// Route-level crash fallback — keeps the rest of the nav tree alive.
export { ScreenErrorFallback as ErrorBoundary } from '@/components/ScreenErrorFallback';

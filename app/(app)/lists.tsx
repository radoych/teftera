// app/(app)/lists.tsx — all shopping lists (spec §8.8).
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import Animated from 'react-native-reanimated';
import { CollapsingHeaderScreen } from '@/components/CollapsingHeader';
import { EmptyState } from '@/components/EmptyState';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { ListRow } from '@/features/shopping/components/ListRow';
import { NewListSheet } from '@/features/shopping/components/NewListSheet';
import { useListViews } from '@/features/shopping/hooks';
import { useShoppingStore } from '@/features/shopping/store';

/** "1 списък" / "3 списъка". */
const listCountLabel = (n: number): string => (n === 1 ? '1 списък' : `${n} списъка`);

export default function ShoppingListsScreen() {
  // `?new=1` (dashboard "Създай списък за магазин") opens the sheet; the param is
  // cleared right away because a tab screen stays mounted between visits.
  const params = useLocalSearchParams<{ new?: string }>();
  const loaded = useShoppingStore((s) => s.loaded);
  const views = useListViews();
  const [creating, setCreating] = useState(false);

  const wantsNew = params.new === '1';
  if (wantsNew && !creating) setCreating(true); // adjust state during render (guarded)

  useEffect(() => {
    if (wantsNew) router.setParams({ new: undefined });
  }, [wantsNew]);

  return (
    <CollapsingHeaderScreen
      title="Списъци"
      subtitle={views.length > 0 ? listCountLabel(views.length) : null}
      withTabBar
      floatingAboveTabBar={
        <FloatingActionBar
          actions={[
            {
              label: 'Нов списък',
              icon: 'playlist-add',
              variant: 'filled',
              onPress: () => setCreating(true),
            },
          ]}
        />
      }
    >
      {({ scrollProps, largeTitle }) => (
        <>
          <Animated.ScrollView {...scrollProps}>
            {largeTitle}

            {loaded && views.length === 0 ? (
              <EmptyState
                icon="checklist"
                title="Няма списъци"
                message="Създай списък за магазин и го отмятай на място."
              />
            ) : null}

            {views.map((view, i) => (
              <ListRow
                key={view.list.id}
                view={view}
                showDivider={i < views.length - 1}
                onPress={() =>
                  router.push({ pathname: '/list/[id]', params: { id: view.list.id } })
                }
              />
            ))}
          </Animated.ScrollView>

          <NewListSheet visible={creating} onClose={() => setCreating(false)} />
        </>
      )}
    </CollapsingHeaderScreen>
  );
}

// Route-level crash fallback — keeps the rest of the nav tree alive.
export { ScreenErrorFallback as ErrorBoundary } from '@/components/ScreenErrorFallback';

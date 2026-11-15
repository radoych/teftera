// app/lists.tsx — all shopping lists (spec §8.8).
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ListRow } from '@/features/shopping/components/ListRow';
import { NewListSheet } from '@/features/shopping/components/NewListSheet';
import { useListViews } from '@/features/shopping/hooks';
import { useShoppingStore } from '@/features/shopping/store';

export default function ShoppingListsScreen() {
  // `?new=1` (dashboard "Създай списък за магазин") opens the sheet once.
  const params = useLocalSearchParams<{ new?: string }>();
  const loaded = useShoppingStore((s) => s.loaded);
  const views = useListViews();
  const [creating, setCreating] = useState(false);
  const consumedNew = useRef(false);

  useEffect(() => {
    if (params.new === '1' && !consumedNew.current) {
      consumedNew.current = true;
      setCreating(true);
    }
  }, [params.new]);

  return (
    <Screen
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
      }>
      <ScreenHeader title="Списъци за пазаруване" />

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
          onPress={() => router.push({ pathname: '/list/[id]', params: { id: view.list.id } })}
        />
      ))}

      <NewListSheet visible={creating} onClose={() => setCreating(false)} />
    </Screen>
  );
}

// Route-level crash fallback — keeps the rest of the nav tree alive.
export { ScreenErrorFallback as ErrorBoundary } from '@/components/ScreenErrorFallback';

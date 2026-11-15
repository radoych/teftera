import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { ImportDoneView } from '@/features/transactions/components/import/ImportDoneView';
import { ImportIdleView } from '@/features/transactions/components/import/ImportIdleView';
import { ImportPreviewView } from '@/features/transactions/components/import/ImportPreviewView';
import { useImportFlow } from '@/features/transactions/import/useImportFlow';
import { useIsOnline } from '@/lib/useIsOnline';

function Header() {
  return (
    <View className="mb-md flex-row items-center gap-3 py-2">
      <Pressable onPress={() => router.back()} hitSlop={8} className="-ml-2 p-2">
        <MaterialIcons name="arrow-back" size={24} color="#e3e2e6" />
      </Pressable>
      <Text className="font-jakarta-semibold text-headline-lg-mobile text-on-surface">
        Импортиране от DSK
      </Text>
    </View>
  );
}

/**
 * DSK import: CSV file or live bank sync → preview → import → summary.
 * State and pipelines live in `useImportFlow`; this screen only picks the view.
 * (Vendor-alias normalisers plug in via `useImportFlow({ normalizers })`.)
 */
export default function ImportDskScreen() {
  const online = useIsOnline();
  const flow = useImportFlow();
  const header = <Header />;

  if (flow.status === 'done' && flow.summary) {
    return <ImportDoneView header={header} summary={flow.summary} onDone={() => router.back()} />;
  }

  if (!flow.preview) {
    return (
      <ImportIdleView
        header={header}
        busy={flow.busy}
        syncing={flow.status === 'syncing'}
        online={online}
        needsReconnect={flow.needsReconnect}
        connection={flow.connection}
        onSync={flow.syncFromBank}
        onPickFile={flow.pickAndParse}
      />
    );
  }

  return (
    <ImportPreviewView
      header={header}
      preview={flow.preview}
      status={flow.status}
      online={online}
      onSync={flow.syncFromBank}
      onPickFile={flow.pickAndParse}
      onImport={flow.onImport}
    />
  );
}

// Route-level crash fallback — keeps the rest of the nav tree alive.
export { ScreenErrorFallback as ErrorBoundary } from '@/components/ScreenErrorFallback';

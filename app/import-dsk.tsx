import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { ImportDoneView } from '@/features/transactions/components/import/ImportDoneView';
import { ImportIdleView } from '@/features/transactions/components/import/ImportIdleView';
import { ImportPreviewView } from '@/features/transactions/components/import/ImportPreviewView';
import type { ImportNormalizers } from '@/features/transactions/import/importFlow';
import { useImportFlow } from '@/features/transactions/import/useImportFlow';
import { vendorNameForKey } from '@/features/vendors/store';
import { useIsOnline } from '@/lib/useIsOnline';
import { normalizeEbTransaction } from '@/services/bank-sync';
import { normalizeDskRow } from '@/services/dsk-import';

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
 * Household recognized names sit in front of the static brand rules. The
 * lookup reads the vendors store at call time (useImportFlow reads its
 * overrides once per mount), so a vendor added mid-session still applies.
 */
const vendorAwareNormalizers: ImportNormalizers = {
  csv: (row) => normalizeDskRow(row, vendorNameForKey),
  bank: (tx) => normalizeEbTransaction(tx, vendorNameForKey),
};

/**
 * DSK import: CSV file or live bank sync → preview → import → summary.
 * State and pipelines live in `useImportFlow`; this screen only picks the view.
 */
export default function ImportDskScreen() {
  const online = useIsOnline();
  const flow = useImportFlow({ normalizers: vendorAwareNormalizers });
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

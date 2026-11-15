// features/transactions/import/useImportFlow.ts — state + handlers for app/import-dsk.tsx.
import { File } from 'expo-file-system';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useAuthStore } from '@/features/auth/store';
import { bulkInsertImported } from '@/features/transactions/api';
import type { ImportSummary } from '@/features/transactions/components/import/ImportSummaryView';
import { buildPreview, type ImportPreview } from '@/features/transactions/preview';
import { useTransactionsStore } from '@/features/transactions/store';
import { refreshTransactions } from '@/features/transactions/sync';
import {
  fetchBankTransactions,
  getBankConnection,
  normalizeEbTransaction,
  startBankSync,
} from '@/services/bank-sync';
import { normalizeDskRow, parseDskCsv } from '@/services/dsk-import';
import {
  DECLINED_ALERT,
  fetchWithConsent,
  isBusyStatus,
  nextStatus,
  normalizeBankRows,
  normalizeCsvRows,
  planImport,
  runConsentFlow,
  syncErrorAlert,
  type ImportEvent,
  type ImportNormalizers,
  type ImportStatus,
} from './importFlow';

export interface BankConnectionInfo {
  bankName: string;
  validUntil: string;
}

/**
 * Everything the flow touches outside React. Defaults are the real Expo modules
 * and services; tests (or the vendors feature) override pieces.
 */
export interface ImportFlowDeps {
  File: Pick<typeof File, 'pickFileAsync'>;
  WebBrowser: Pick<typeof WebBrowser, 'openAuthSessionAsync'>;
  Linking: Pick<typeof Linking, 'createURL' | 'parse'>;
  fetchBankTransactions: typeof fetchBankTransactions;
  startBankSync: typeof startBankSync;
  getBankConnection: typeof getBankConnection;
  bulkInsertImported: typeof bulkInsertImported;
  refreshTransactions: typeof refreshTransactions;
  /** Vendor-alias seam: swap in lookup-aware normalisers (spec 2026-09-09 §6.7). */
  normalizers: ImportNormalizers;
  alert: (title: string, message: string) => void;
}

export const defaultImportFlowDeps: ImportFlowDeps = {
  File,
  WebBrowser,
  Linking,
  fetchBankTransactions,
  startBankSync,
  getBankConnection,
  bulkInsertImported,
  refreshTransactions,
  normalizers: { csv: normalizeDskRow, bank: normalizeEbTransaction },
  alert: (title, message) => Alert.alert(title, message),
};

const CSV_MIME_TYPES = ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel'];

export interface ImportFlow {
  status: ImportStatus;
  /** reading or syncing — the idle view shows a spinner instead of actions. */
  busy: boolean;
  preview: ImportPreview | null;
  summary: ImportSummary | null;
  connection: BankConnectionInfo | null;
  /** The last sync found an expired consent — label the button "reconnect". */
  needsReconnect: boolean;
  pickAndParse: () => Promise<void>;
  syncFromBank: () => Promise<void>;
  onImport: () => Promise<void>;
}

export function useImportFlow(overrides: Partial<ImportFlowDeps> = {}): ImportFlow {
  // Resolved once per mount: overrides are read on first render only.
  const [deps] = useState<ImportFlowDeps>(() => ({ ...defaultImportFlowDeps, ...overrides }));

  const [status, setStatus] = useState<ImportStatus>('idle');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [connection, setConnection] = useState<BankConnectionInfo | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const transactions = useTransactionsStore((s) => s.transactions);
  const categories = useTransactionsStore((s) => s.categories);
  const householdId = useAuthStore((s) => s.householdId);

  const loadConnection = useCallback(() => {
    if (!householdId) return;
    deps.getBankConnection(householdId).then(setConnection).catch(() => {});
  }, [deps, householdId]);

  useEffect(loadConnection, [loadConnection]);

  const hasPreview = preview !== null;
  const can = (event: ImportEvent): boolean => nextStatus(status, event) !== null;
  /** Apply `event` from a known status, per IMPORT_TRANSITIONS (illegal moves are no-ops). */
  const move = (from: ImportStatus, event: ImportEvent) => {
    const to = nextStatus(from, event, hasPreview);
    if (to !== null) setStatus(to);
  };

  const pickAndParse = async () => {
    if (!can('pick')) return;
    const from = status;
    try {
      // Pick via expo-file-system's own picker: it returns a module-owned File
      // that is readable in Expo Go, unlike an external DocumentPicker cache URI
      // (which Android scoped storage rejects for read).
      const result = await deps.File.pickFileAsync({ mimeTypes: CSV_MIME_TYPES });
      if (result.canceled) return;

      const file = result.result;
      move(from, 'pick');
      const text = await file.text();
      const rows = normalizeCsvRows(parseDskCsv(text), deps.normalizers.csv);

      setPreview(buildPreview(rows, transactions, file.name, 'csv', false));
      move('reading', 'loaded');
    } catch (err) {
      if (__DEV__) console.warn('[dsk-import] parse failed', err);
      move('reading', 'failed');
      deps.alert('Грешка', 'Файлът не можа да бъде прочетен. Опитай с друг CSV.');
    }
  };

  const syncFromBank = async () => {
    if (!can('sync')) return;
    move(status, 'sync');
    try {
      const result = await fetchWithConsent({
        fetchBankTransactions: deps.fetchBankTransactions,
        consent: () =>
          runConsentFlow({
            // teftera://bank-sync (dev client) or exp://…/--/bank-sync (Expo Go)
            createReturnUrl: () => deps.Linking.createURL('bank-sync'),
            startBankSync: deps.startBankSync,
            openAuthSession: (url, returnUrl) =>
              deps.WebBrowser.openAuthSessionAsync(url, returnUrl),
            parseQueryStatus: (url) => deps.Linking.parse(url).queryParams?.status,
          }),
        onConsented: () => {
          setNeedsReconnect(false);
          loadConnection();
        },
      });

      if (result.kind === 'declined') {
        move('syncing', 'failed');
        setNeedsReconnect(result.expired);
        deps.alert(DECLINED_ALERT.title, DECLINED_ALERT.message);
        return;
      }

      const rows = normalizeBankRows(result.transactions, deps.normalizers.bank);
      setPreview(buildPreview(rows, transactions, 'Синхронизация с ДСК', 'bank', result.truncated));
      move('syncing', 'loaded');
    } catch (err) {
      if (__DEV__) console.warn('[bank-sync] failed', err);
      move('syncing', 'failed');
      const alert = syncErrorAlert(err);
      if (alert.needsReconnect) setNeedsReconnect(true);
      deps.alert(alert.title, alert.message);
    }
  };

  const onImport = async () => {
    const total = preview ? preview.newExpenses.length + preview.newIncome.length : 0;
    if (!preview || total === 0 || !can('import')) return;
    const { householdId: hid, session } = useAuthStore.getState();
    if (!hid) {
      deps.alert('Грешка', 'Няма активно домакинство.');
      return;
    }
    move(status, 'import');
    try {
      // Re-dedupe against the FRESH store state — a partner may have inserted a
      // transaction between building the preview and confirming the import.
      const { rows, summary: next } = planImport(
        preview,
        useTransactionsStore.getState().transactions,
        { householdId: hid, userId: session?.user.id ?? null, categories },
      );
      await deps.bulkInsertImported(rows);
      await deps.refreshTransactions(hid);
      setSummary(next);
      move('importing', 'imported');
    } catch {
      move('importing', 'importFailed');
      deps.alert('Грешка', 'Импортирането не успя. Опитай отново.');
    }
  };

  return {
    status,
    busy: isBusyStatus(status),
    preview,
    summary,
    connection,
    needsReconnect,
    pickAndParse,
    syncFromBank,
    onImport,
  };
}

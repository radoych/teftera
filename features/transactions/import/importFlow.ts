// features/transactions/import/importFlow.ts — the import screen's state machine and
// pipelines, free of React and Expo so the consent retry path is unit-testable.
import type { ImportSummary } from '@/features/transactions/components/import/ImportSummaryView';
import type { ImportedTransaction } from '@/features/transactions/api';
import { dedupeImport } from '@/features/transactions/dedup';
import { previewCandidates, type ImportPreview } from '@/features/transactions/preview';
import type { CategoryLite, Transaction } from '@/features/transactions/types';
import { resolveCategoryId } from '@/lib/categories';
import {
  ConsentExpiredError,
  NotConnectedError,
  RateLimitedError,
  type EbTransaction,
} from '@/services/bank-sync';
import type { DskParsedRow, NormalizedTransaction } from '@/services/dsk-import';

// ---------------------------------------------------------------------------
// Status machine
// ---------------------------------------------------------------------------

export type ImportStatus = 'idle' | 'reading' | 'syncing' | 'ready' | 'importing' | 'done';

export type ImportEvent =
  | 'pick' // a file was chosen, start reading it
  | 'sync' // start a bank sync (may include the consent round-trip)
  | 'loaded' // rows parsed / fetched — a preview exists
  | 'failed' // read or sync failed (or consent declined) — back to where we were
  | 'import' // confirm: insert the preview's new rows
  | 'imported' // insert + refresh succeeded
  | 'importFailed'; // insert failed — the preview is still valid

/**
 * Every legal move. Anything not listed is ignored — this is where the
 * "don't start a second sync while one is running" guards live.
 *
 * `failed` from reading/syncing goes to `idle` here; when a preview is already on
 * screen the hook uses `failedTarget` to land on `ready` instead (the old preview
 * stays visible and importable, exactly as before the split).
 */
export const IMPORT_TRANSITIONS: Readonly<
  Record<ImportStatus, Partial<Record<ImportEvent, ImportStatus>>>
> = {
  idle: { pick: 'reading', sync: 'syncing' },
  reading: { loaded: 'ready', failed: 'idle' },
  syncing: { loaded: 'ready', failed: 'idle' },
  ready: { pick: 'reading', sync: 'syncing', import: 'importing' },
  importing: { imported: 'done', importFailed: 'ready' },
  done: {},
};

/** The status `event` leads to from `status`, or null when the move isn't allowed. */
export function nextStatus(
  status: ImportStatus,
  event: ImportEvent,
  hasPreview = false,
): ImportStatus | null {
  const to = IMPORT_TRANSITIONS[status][event] ?? null;
  if (to === null) return null;
  return event === 'failed' ? failedTarget(hasPreview) : to;
}

/** Where a failed read/sync lands: back on the preview if one is showing. */
export function failedTarget(hasPreview: boolean): ImportStatus {
  return hasPreview ? 'ready' : 'idle';
}

export const isBusyStatus = (s: ImportStatus): boolean => s === 'reading' || s === 'syncing';

// ---------------------------------------------------------------------------
// Normalisers — the vendor-alias seam
// ---------------------------------------------------------------------------

/**
 * How raw rows become `NormalizedTransaction`s. Defaults to the static
 * `normalizeDskRow` / `normalizeEbTransaction`. The vendors feature (spec
 * 2026-09-09 §6.7) injects household-alias-aware versions here, e.g.
 * `{ csv: (r) => normalizeDskRow(r, lookup), bank: (t) => normalizeEbTransaction(t, lookup) }`.
 */
export interface ImportNormalizers {
  csv: (row: DskParsedRow) => NormalizedTransaction | null;
  bank: (tx: EbTransaction) => NormalizedTransaction | null;
}

const notNull = <T>(x: T | null): x is T => x !== null;

export function normalizeCsvRows(
  rows: DskParsedRow[],
  normalize: ImportNormalizers['csv'],
): NormalizedTransaction[] {
  return rows.map((r) => normalize(r)).filter(notNull);
}

export function normalizeBankRows(
  txs: EbTransaction[],
  normalize: ImportNormalizers['bank'],
): NormalizedTransaction[] {
  return txs.map((t) => normalize(t)).filter(notNull);
}

// ---------------------------------------------------------------------------
// Bank sync with the consent retry
// ---------------------------------------------------------------------------

/** The Expo / edge pieces the consent round-trip needs (injected for tests). */
export interface ConsentDeps {
  createReturnUrl: () => string;
  startBankSync: (returnUrl: string) => Promise<string>;
  openAuthSession: (
    url: string,
    returnUrl: string,
  ) => Promise<{ type: 'success'; url: string } | { type: string }>;
  parseQueryStatus: (url: string) => unknown;
}

/**
 * Open the bank's consent page and wait for the redirect back. True only when
 * the browser returned to our URL with `?status=ok`.
 */
export async function runConsentFlow(deps: ConsentDeps): Promise<boolean> {
  const returnUrl = deps.createReturnUrl();
  const authUrl = await deps.startBankSync(returnUrl);
  const result = await deps.openAuthSession(authUrl, returnUrl);
  if (result.type !== 'success' || !('url' in result)) return false;
  return deps.parseQueryStatus(result.url) === 'ok';
}

export interface BankFetchDeps {
  fetchBankTransactions: () => Promise<{ transactions: EbTransaction[]; truncated: boolean }>;
  /** Runs the consent round-trip; resolves true when the user completed it. */
  consent: () => Promise<boolean>;
  /** Called right after a completed consent, before the retry fetch. */
  onConsented?: () => void;
}

export type BankFetchResult =
  | { kind: 'fetched'; transactions: EbTransaction[]; truncated: boolean }
  /** Consent was needed and not completed. `expired` = the old one lapsed (vs never connected). */
  | { kind: 'declined'; expired: boolean };

/**
 * Fetch bank transactions; on "not connected" / "consent expired" run the
 * consent flow once and retry. Any other error — or a failure of the retry —
 * propagates to the caller (see `syncErrorAlert`).
 */
export async function fetchWithConsent(deps: BankFetchDeps): Promise<BankFetchResult> {
  try {
    return { kind: 'fetched', ...(await deps.fetchBankTransactions()) };
  } catch (err) {
    if (!(err instanceof NotConnectedError || err instanceof ConsentExpiredError)) throw err;
    const consented = await deps.consent();
    if (!consented) return { kind: 'declined', expired: err instanceof ConsentExpiredError };
    deps.onConsented?.();
    return { kind: 'fetched', ...(await deps.fetchBankTransactions()) };
  }
}

export interface SyncErrorAlert {
  title: string;
  message: string;
  /** Show "reconnect" on the sync button afterwards. */
  needsReconnect: boolean;
}

export const DECLINED_ALERT: SyncErrorAlert = {
  title: 'Синхронизация',
  message: 'Свързването с банката не беше завършено.',
  needsReconnect: false,
};

/** User-facing copy for a failed sync. */
export function syncErrorAlert(err: unknown): SyncErrorAlert {
  if (err instanceof RateLimitedError) {
    return {
      title: 'Синхронизация',
      message: 'Лимитът на банката е достигнат — опитай по-късно.',
      needsReconnect: false,
    };
  }
  if (err instanceof ConsentExpiredError) {
    return {
      title: 'Синхронизация',
      message: 'Достъпът до банката е изтекъл. Свържи се отново.',
      needsReconnect: true,
    };
  }
  return { title: 'Грешка', message: 'Синхронизацията не успя. Опитай отново.', needsReconnect: false };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * The rows to insert for a confirmed preview, re-deduplicated against `fresh`
 * (a partner may have inserted a matching row since the preview was built),
 * plus the summary to show afterwards.
 */
export function planImport(
  preview: ImportPreview,
  fresh: Transaction[],
  ctx: { householdId: string; userId: string | null; categories: CategoryLite[] },
): { rows: ImportedTransaction[]; summary: ImportSummary } {
  const candidates = previewCandidates(preview);
  const { toImport } = dedupeImport(candidates, fresh);
  const rows: ImportedTransaction[] = toImport.map((r) => ({
    householdId: ctx.householdId,
    userId: ctx.userId,
    kind: r.kind,
    amountCents: r.amountEurCents,
    originalAmountCents: r.originalAmountCents,
    originalCurrency: r.originalCurrency,
    merchant: r.merchant,
    categoryId: resolveCategoryId(r.merchant, ctx.categories, r.kind),
    date: r.date,
    occurredAt: r.occurredAt,
    note: null,
  }));
  return {
    rows,
    summary: {
      imported: toImport.length,
      duplicates: preview.duplicates.length + (candidates.length - toImport.length),
      other: toImport.filter((r) => r.kind === 'expense' && r.categoryGuess === 'Other').length,
    },
  };
}

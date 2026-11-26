import { buildPreview } from '@/features/transactions/preview';
import type { CategoryLite, Transaction } from '@/features/transactions/types';
import {
  ConsentExpiredError,
  NotConnectedError,
  RateLimitedError,
  type EbTransaction,
} from '@/services/bank-sync';
import type { DskParsedRow, NormalizedTransaction } from '@/services/dsk-import';
import {
  IMPORT_TRANSITIONS,
  fetchWithConsent,
  isBusyStatus,
  nextStatus,
  normalizeBankRows,
  normalizeCsvRows,
  planImport,
  runConsentFlow,
  syncErrorAlert,
  type ConsentDeps,
  type ImportStatus,
} from './importFlow';

const ebTx = { entry_reference: 'r1' } as unknown as EbTransaction;
const page = (n: number, truncated = false) => ({
  transactions: Array.from({ length: n }, () => ebTx),
  truncated,
});

describe('IMPORT_TRANSITIONS / nextStatus', () => {
  it('only allows starting a pick or a sync from idle or ready', () => {
    const statuses: ImportStatus[] = ['idle', 'reading', 'syncing', 'ready', 'importing', 'done'];
    const canStart = statuses.filter((s) => nextStatus(s, 'sync') !== null);
    expect(canStart).toEqual(['idle', 'ready']);
    expect(statuses.filter((s) => nextStatus(s, 'pick') !== null)).toEqual(['idle', 'ready']);
  });

  it('only imports from ready', () => {
    expect(nextStatus('ready', 'import')).toBe('importing');
    expect(nextStatus('idle', 'import')).toBeNull();
    expect(nextStatus('syncing', 'import')).toBeNull();
    expect(nextStatus('importing', 'import')).toBeNull();
  });

  it('returns to the preview after a failed read/sync when one is showing', () => {
    expect(nextStatus('syncing', 'failed', false)).toBe('idle');
    expect(nextStatus('syncing', 'failed', true)).toBe('ready');
    expect(nextStatus('reading', 'failed', true)).toBe('ready');
  });

  it('keeps the preview importable after an insert failure', () => {
    expect(nextStatus('importing', 'importFailed')).toBe('ready');
    expect(nextStatus('importing', 'imported')).toBe('done');
  });

  it('treats done as terminal', () => {
    expect(IMPORT_TRANSITIONS.done).toEqual({});
  });

  it('marks reading and syncing as busy', () => {
    expect(isBusyStatus('reading')).toBe(true);
    expect(isBusyStatus('syncing')).toBe(true);
    expect(isBusyStatus('ready')).toBe(false);
  });
});

describe('runConsentFlow', () => {
  function deps(overrides: Partial<ConsentDeps> = {}): ConsentDeps {
    return {
      createReturnUrl: () => 'teftera://bank-sync',
      startBankSync: jest.fn(async () => 'https://bank/auth'),
      openAuthSession: jest.fn(async () => ({
        type: 'success' as const,
        url: 'teftera://bank-sync?status=ok',
      })),
      parseQueryStatus: (url) => /[?&]status=([^&]*)/.exec(url)?.[1],
      ...overrides,
    };
  }

  it('opens the auth URL with our return URL and succeeds on status=ok', async () => {
    const d = deps();
    await expect(runConsentFlow(d)).resolves.toBe(true);
    expect(d.startBankSync).toHaveBeenCalledWith('teftera://bank-sync');
    expect(d.openAuthSession).toHaveBeenCalledWith('https://bank/auth', 'teftera://bank-sync');
  });

  it('fails when the browser was dismissed', async () => {
    const d = deps({ openAuthSession: async () => ({ type: 'dismiss' }) });
    await expect(runConsentFlow(d)).resolves.toBe(false);
  });

  it('fails when the bank redirected back with an error status', async () => {
    const d = deps({
      openAuthSession: async () => ({ type: 'success', url: 'teftera://bank-sync?status=error' }),
    });
    await expect(runConsentFlow(d)).resolves.toBe(false);
  });
});

describe('fetchWithConsent', () => {
  it('returns the first fetch without touching consent when connected', async () => {
    const consent = jest.fn();
    const result = await fetchWithConsent({
      fetchBankTransactions: async () => page(2, true),
      consent,
    });
    expect(result).toEqual({ kind: 'fetched', ...page(2, true) });
    expect(consent).not.toHaveBeenCalled();
  });

  it.each([
    ['not connected', new NotConnectedError('not_connected')],
    ['consent expired', new ConsentExpiredError('consent_expired')],
  ])('%s → consent → retries the fetch once', async (_label, firstError) => {
    const fetchBankTransactions = jest
      .fn()
      .mockRejectedValueOnce(firstError)
      .mockResolvedValueOnce(page(3));
    const calls: string[] = [];
    const result = await fetchWithConsent({
      fetchBankTransactions,
      consent: async () => {
        calls.push('consent');
        return true;
      },
      onConsented: () => calls.push('onConsented'),
    });
    expect(result).toEqual({ kind: 'fetched', ...page(3) });
    expect(fetchBankTransactions).toHaveBeenCalledTimes(2);
    expect(calls).toEqual(['consent', 'onConsented']);
  });

  it('reports a declined consent, distinguishing expired from never connected', async () => {
    const declinedFor = (err: Error) =>
      fetchWithConsent({
        fetchBankTransactions: jest.fn().mockRejectedValue(err),
        consent: async () => false,
      });
    await expect(declinedFor(new ConsentExpiredError('x'))).resolves.toEqual({
      kind: 'declined',
      expired: true,
    });
    await expect(declinedFor(new NotConnectedError('x'))).resolves.toEqual({
      kind: 'declined',
      expired: false,
    });
  });

  it('does not call onConsented or retry when consent is declined', async () => {
    const fetchBankTransactions = jest.fn().mockRejectedValue(new NotConnectedError('x'));
    const onConsented = jest.fn();
    await fetchWithConsent({ fetchBankTransactions, consent: async () => false, onConsented });
    expect(fetchBankTransactions).toHaveBeenCalledTimes(1);
    expect(onConsented).not.toHaveBeenCalled();
  });

  it('propagates a failure of the retry fetch (after onConsented ran)', async () => {
    const onConsented = jest.fn();
    const retryError = new ConsentExpiredError('still expired');
    const p = fetchWithConsent({
      fetchBankTransactions: jest
        .fn()
        .mockRejectedValueOnce(new NotConnectedError('x'))
        .mockRejectedValueOnce(retryError),
      consent: async () => true,
      onConsented,
    });
    await expect(p).rejects.toBe(retryError);
    expect(onConsented).toHaveBeenCalledTimes(1);
  });

  it('propagates a consent-flow failure (e.g. bank-sync-start down)', async () => {
    const boom = new Error('bank-sync-start failed (500)');
    await expect(
      fetchWithConsent({
        fetchBankTransactions: jest.fn().mockRejectedValue(new NotConnectedError('x')),
        consent: async () => {
          throw boom;
        },
      }),
    ).rejects.toBe(boom);
  });

  it('does not run consent for other errors', async () => {
    const consent = jest.fn();
    const err = new RateLimitedError('rate_limited');
    await expect(
      fetchWithConsent({ fetchBankTransactions: jest.fn().mockRejectedValue(err), consent }),
    ).rejects.toBe(err);
    expect(consent).not.toHaveBeenCalled();
  });
});

describe('syncErrorAlert', () => {
  it('maps rate limits, expired consent and everything else', () => {
    expect(syncErrorAlert(new RateLimitedError('x'))).toMatchObject({
      title: 'Синхронизация',
      needsReconnect: false,
    });
    expect(syncErrorAlert(new ConsentExpiredError('x'))).toMatchObject({
      title: 'Синхронизация',
      needsReconnect: true,
    });
    expect(syncErrorAlert(new Error('500'))).toMatchObject({
      title: 'Грешка',
      needsReconnect: false,
    });
  });
});

function row(partial: Partial<NormalizedTransaction>): NormalizedTransaction {
  return {
    kind: 'expense',
    amountEurCents: 1000,
    originalAmountCents: null,
    originalCurrency: null,
    merchant: 'Lidl',
    categoryGuess: 'Groceries',
    date: '2026-02-10',
    occurredAt: '2026-02-10T10:00:00.000Z',
    ...partial,
  };
}

describe('normalizers seam', () => {
  it('runs the injected CSV normaliser and drops nulls', () => {
    const rows = [{ merchantRaw: 'a' }, { merchantRaw: 'skip' }] as unknown as DskParsedRow[];
    const out = normalizeCsvRows(rows, (r) =>
      r.merchantRaw === 'skip' ? null : row({ merchant: `alias:${r.merchantRaw}` }),
    );
    expect(out.map((r) => r.merchant)).toEqual(['alias:a']);
  });

  it('runs the injected bank normaliser and drops nulls', () => {
    let n = 0;
    const out = normalizeBankRows([ebTx, ebTx], () => (n++ === 0 ? row({}) : null));
    expect(out).toHaveLength(1);
  });
});

describe('planImport', () => {
  const categories: CategoryLite[] = [];
  const existingTx = (merchant: string, amount: number, date: string): Transaction =>
    ({ merchant, amount_eur: amount, date, kind: 'expense' }) as Transaction;

  it('re-dedupes against fresh rows and counts late duplicates as duplicates', () => {
    const a = row({ merchant: 'A', amountEurCents: 100 });
    const b = row({ merchant: 'B', amountEurCents: 200, categoryGuess: 'Other' });
    const inc = row({ kind: 'income', merchant: 'Заплата', amountEurCents: 5000, categoryGuess: 'Other' });
    const dup = row({ merchant: 'D', amountEurCents: 300 });
    const preview = buildPreview(
      [a, b, inc, dup],
      [existingTx('D', 300, dup.date)],
      'f.csv',
      'csv',
      false,
      '2026-01-01',
    );

    // A partner inserted A meanwhile.
    const fresh = [existingTx('D', 300, dup.date), existingTx('A', 100, a.date)];
    const { rows, summary } = planImport(preview, fresh, {
      householdId: 'h1',
      userId: 'u1',
      categories,
    });

    expect(rows.map((r) => r.merchant)).toEqual(['B', 'Заплата']);
    expect(rows[0]).toMatchObject({
      householdId: 'h1',
      userId: 'u1',
      kind: 'expense',
      amountCents: 200,
      note: null,
    });
    // Only expenses count toward "Other"; income guessed Other does not.
    expect(summary).toEqual({ imported: 2, duplicates: 2, other: 1 });
  });

  it("applies the vendor default over the rules and drops those rows from 'Other'", () => {
    const cats: CategoryLite[] = [
      { id: 'e-gro', name: 'Groceries', icon: 'x', color: '#fff', kind: 'expense' },
      { id: 'e-food', name: 'Food & Dining', icon: 'x', color: '#fff', kind: 'expense' },
      { id: 'e-other', name: 'Other', icon: 'x', color: '#fff', kind: 'expense' },
      { id: 'i-other', name: 'Друг приход', icon: 'x', color: '#fff', kind: 'income' },
    ];
    const lidl = row({ merchant: 'Lidl', amountEurCents: 100, categoryGuess: 'Groceries' });
    const corner = row({ merchant: 'Corner', amountEurCents: 200, categoryGuess: 'Other' });
    const unknown = row({ merchant: 'Unknown', amountEurCents: 300, categoryGuess: 'Other' });
    const refund = row({
      kind: 'income',
      merchant: 'Lidl',
      amountEurCents: 50,
      categoryGuess: 'Other',
    });
    const preview = buildPreview(
      [lidl, corner, unknown, refund],
      [],
      'f.csv',
      'csv',
      false,
      '2026-01-01',
    );
    const defaults: Record<string, string> = { Lidl: 'e-food', Corner: 'e-gro' };

    const { rows, summary } = planImport(preview, [], {
      householdId: 'h1',
      userId: null,
      categories: cats,
      vendorDefaultFor: (m) => defaults[m] ?? null,
    });

    const categoryOf = (m: string, k: string) =>
      rows.find((r) => r.merchant === m && r.kind === k)?.categoryId;
    expect(categoryOf('Lidl', 'expense')).toBe('e-food');
    expect(categoryOf('Corner', 'expense')).toBe('e-gro');
    expect(categoryOf('Unknown', 'expense')).toBe('e-other');
    // Kind mismatch: an expense default never lands on an income row.
    expect(categoryOf('Lidl', 'income')).toBe('i-other');
    expect(summary.other).toBe(1);
  });
});

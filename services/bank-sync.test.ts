import {
  ConsentExpiredError,
  NotConnectedError,
  RateLimitedError,
  fetchBankTransactions,
  normalizeEbTransaction,
  type EbTransaction,
} from './bank-sync';
import { supabase } from '@/services/supabase';

declare const global: {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

jest.mock('@/services/supabase', () => ({
  supabase: { auth: { getSession: jest.fn() }, from: jest.fn() },
}));

const base: EbTransaction = {
  transaction_amount: { amount: '12.34', currency: 'EUR' },
  credit_debit_indicator: 'DBIT',
  status: 'BOOK',
  booking_date: '2026-07-01',
  value_date: '2026-07-02',
  creditor: { name: 'LIDL SOFIA' },
  remittance_information: ['POS purchase LIDL'],
};

describe('normalizeEbTransaction', () => {
  it('maps a booked EUR debit to an expense in integer cents', () => {
    const r = normalizeEbTransaction(base);
    expect(r).toEqual({
      kind: 'expense',
      amountEurCents: 1234,
      originalAmountCents: null,
      originalCurrency: null,
      merchant: 'Lidl', // BRAND_RULES via normalizeMerchant
      categoryGuess: expect.any(String),
      date: '2026-07-01',
      occurredAt: expect.stringMatching(/T/),
    });
  });

  it('maps CRDT rows to income (preview skips them, like CSV)', () => {
    const r = normalizeEbTransaction({ ...base, credit_debit_indicator: 'CRDT' });
    expect(r?.kind).toBe('income');
  });

  it('converts BGN legacy rows at the fixed rate and retains originals', () => {
    const r = normalizeEbTransaction({
      ...base,
      transaction_amount: { amount: '19.56', currency: 'BGN' },
    });
    expect(r?.amountEurCents).toBe(1000); // 1956 / 1.95583 rounded
    expect(r?.originalAmountCents).toBe(1956);
    expect(r?.originalCurrency).toBe('BGN');
  });

  it('falls back to remittance information when creditor name is missing', () => {
    const r = normalizeEbTransaction({ ...base, creditor: null });
    expect(r?.merchant).toBe('Lidl'); // brand rule still matches the remittance text
  });

  it('uses value_date when booking_date is missing', () => {
    const r = normalizeEbTransaction({ ...base, booking_date: null });
    expect(r?.date).toBe('2026-07-02');
  });

  it('returns null for non-booked, unparseable-amount, unknown-currency, and dateless rows', () => {
    expect(normalizeEbTransaction({ ...base, status: 'PDNG' })).toBeNull();
    expect(
      normalizeEbTransaction({ ...base, transaction_amount: { amount: 'x', currency: 'EUR' } }),
    ).toBeNull();
    expect(
      normalizeEbTransaction({ ...base, transaction_amount: { amount: '5.00', currency: 'USD' } }),
    ).toBeNull();
    expect(normalizeEbTransaction({ ...base, booking_date: null, value_date: null })).toBeNull();
  });

  it('takes absolute value of negative amounts', () => {
    const r = normalizeEbTransaction({
      ...base,
      transaction_amount: { amount: '-7.50', currency: 'EUR' },
    });
    expect(r?.amountEurCents).toBe(750);
  });
});

describe('fetchBankTransactions error mapping', () => {
  const mockSession = () =>
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { access_token: 'tok' } },
    });

  const mockFetch = (status: number, body: unknown) => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: status < 400,
      status,
      json: async () => body,
    }) as unknown as typeof fetch;
  };

  beforeEach(() => mockSession());

  it('maps 409 not_connected', async () => {
    mockFetch(409, { error: 'not_connected' });
    await expect(fetchBankTransactions()).rejects.toBeInstanceOf(NotConnectedError);
  });

  it('maps 409 consent_expired', async () => {
    mockFetch(409, { error: 'consent_expired' });
    await expect(fetchBankTransactions()).rejects.toBeInstanceOf(ConsentExpiredError);
  });

  it('maps 429 to RateLimitedError', async () => {
    mockFetch(429, { error: 'rate_limited' });
    await expect(fetchBankTransactions()).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('returns the transactions array on 200', async () => {
    mockFetch(200, { transactions: [{ x: 1 }], validUntil: '2026-10-01T00:00:00Z' });
    await expect(fetchBankTransactions()).resolves.toEqual([{ x: 1 }]);
  });

  it('sends the right URL, method, and auth headers', async () => {
    mockFetch(200, { transactions: [], validUntil: 'x' });
    await fetchBankTransactions();
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toMatch(/\/functions\/v1\/bank-sync-transactions$/);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(typeof init.headers.apikey).toBe('string');
  });
});

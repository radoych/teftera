/**
 * Enable Banking live sync — client seam.
 *
 * This module is the ONLY place the app talks to the bank-sync Edge Functions
 * (which in turn are the only place Enable Banking is called — the EB private
 * key never reaches the client). The normalizer below converts EB's PSD2
 * transaction shape into the same NormalizedTransaction the DSK CSV path
 * produces, so preview/dedupe/import are shared unchanged.
 */
import { guessCategory } from '@/lib/categories';
import { bgnToEurCents } from '@/lib/formatCurrency';
import {
  normalizeMerchant,
  occurredAtISO,
  type NormalizedTransaction,
} from '@/services/dsk-import';
import { supabase } from '@/services/supabase';

/** The subset of Enable Banking's transaction resource we consume. */
export interface EbTransaction {
  transaction_amount: { amount: string; currency: string };
  credit_debit_indicator: string; // 'DBIT' | 'CRDT'
  status?: string | null; // 'BOOK' | 'PDNG' | ...
  booking_date?: string | null; // YYYY-MM-DD
  value_date?: string | null; // YYYY-MM-DD
  creditor?: { name?: string | null } | null;
  debtor?: { name?: string | null } | null;
  remittance_information?: string[] | null;
}

/**
 * Map one EB transaction to the CSV pipeline's shape. Returns null for rows
 * the import cannot represent (pending, unparseable amount, unsupported
 * currency, no date) — callers count and drop them.
 */
export function normalizeEbTransaction(tx: EbTransaction): NormalizedTransaction | null {
  if (tx.status && tx.status !== 'BOOK') return null;

  const value = Number(tx.transaction_amount?.amount);
  if (!Number.isFinite(value)) return null;
  const rawCents = Math.round(Math.abs(value) * 100);
  if (rawCents === 0) return null;

  const currency = tx.transaction_amount.currency;
  if (currency !== 'EUR' && currency !== 'BGN') return null;

  const date = tx.booking_date || tx.value_date || null;
  if (!date) return null;

  const isIncome = tx.credit_debit_indicator === 'CRDT';
  const counterparty = isIncome ? tx.debtor?.name : tx.creditor?.name;
  const rawMerchant =
    counterparty?.trim() || (tx.remittance_information ?? []).join(' ').trim();
  const merchant = normalizeMerchant(rawMerchant);

  const base = {
    kind: (isIncome ? 'income' : 'expense') as 'income' | 'expense',
    merchant,
    categoryGuess: guessCategory(merchant),
    date,
    occurredAt: occurredAtISO(date, ''),
  };

  if (currency === 'BGN') {
    return {
      ...base,
      amountEurCents: bgnToEurCents(rawCents),
      originalAmountCents: rawCents,
      originalCurrency: 'BGN',
    };
  }
  return { ...base, amountEurCents: rawCents, originalAmountCents: null, originalCurrency: null };
}

const FUNCTIONS_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''}/functions/v1`;

export class NotConnectedError extends Error {}
export class ConsentExpiredError extends Error {}
export class RateLimitedError extends Error {}

async function callBankSyncFn(name: string, body?: unknown): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('not signed in');
  return await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Begin the consent flow; returns the bank authorization URL to open. */
export async function startBankSync(returnUrl: string): Promise<string> {
  const res = await callBankSyncFn('bank-sync-start', { returnUrl });
  if (!res.ok) throw new Error(`bank-sync-start failed (${res.status})`);
  const data = (await res.json()) as { url?: string };
  if (typeof data.url !== 'string') throw new Error('bank-sync-start: malformed response');
  return data.url;
}

/** Pull the last 90 days of raw EB transactions for this household. */
export async function fetchBankTransactions(): Promise<EbTransaction[]> {
  const res = await callBankSyncFn('bank-sync-transactions');
  if (res.status === 409) {
    let error: string | undefined;
    try {
      ({ error } = (await res.json()) as { error?: string });
    } catch {
      throw new Error('bank-sync-transactions: malformed 409 response');
    }
    if (error === 'not_connected') throw new NotConnectedError(error);
    throw new ConsentExpiredError(error ?? 'consent_expired');
  }
  if (res.status === 429) throw new RateLimitedError('rate_limited');
  if (!res.ok) throw new Error(`bank-sync-transactions failed (${res.status})`);
  const data = (await res.json()) as { transactions?: EbTransaction[] };
  return data.transactions ?? [];
}

/** The household's connection metadata (secret column is not even readable). */
export async function getBankConnection(
  householdId: string,
): Promise<{ bankName: string; validUntil: string } | null> {
  const { data, error } = await supabase
    .from('bank_connections')
    .select('bank_name, valid_until')
    .eq('household_id', householdId)
    .maybeSingle();
  if (error || !data) return null;
  return { bankName: data.bank_name as string, validUntil: data.valid_until as string };
}

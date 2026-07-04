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

/** The subset of Enable Banking's transaction resource we consume. */
export interface EbTransaction {
  transaction_amount: { amount: string; currency: string };
  credit_debit_indicator: string; // 'DBIT' | 'CRDT'
  status?: string | null; // 'BOOK' | 'PDNG' | ...
  booking_date?: string | null; // YYYY-MM-DD
  value_date?: string | null; // YYYY-MM-DD
  creditor?: { name?: string | null } | null;
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

  const currency = tx.transaction_amount.currency;
  if (currency !== 'EUR' && currency !== 'BGN') return null;

  const date = tx.booking_date || tx.value_date || null;
  if (!date) return null;

  const rawMerchant =
    tx.creditor?.name?.trim() || (tx.remittance_information ?? []).join(' ').trim();
  const merchant = normalizeMerchant(rawMerchant);

  const base = {
    kind: (tx.credit_debit_indicator === 'CRDT' ? 'income' : 'expense') as 'income' | 'expense',
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

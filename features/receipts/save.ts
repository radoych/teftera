import { createTransaction, type NewTransaction } from '@/features/transactions/api';
import { insertReceipt, type NewReceipt } from './api';

export interface SaveReceiptInput {
  householdId: string;
  userId: string | null;
  storagePath: string;
  rawGeminiJson: unknown;
  amountCents: number;
  merchant: string;
  categoryId: string | null;
  date: string; // YYYY-MM-DD
  note: string | null;
}

export interface SaveReceiptDeps {
  insertReceipt: typeof insertReceipt;
  createTransaction: typeof createTransaction;
}

const defaultDeps: SaveReceiptDeps = { insertReceipt, createTransaction };

/**
 * Persist a scanned receipt: insert the `receipts` row first (for its id),
 * then the linked `transactions` row. Sequential — a transaction failure
 * leaves an orphan receipt row, which is accepted (no RPC wrapper).
 */
export async function saveReceiptTransaction(
  input: SaveReceiptInput,
  deps: SaveReceiptDeps = defaultDeps,
): Promise<{ id: string }> {
  const receipt: NewReceipt = {
    householdId: input.householdId,
    userId: input.userId,
    storagePath: input.storagePath,
    rawGeminiJson: input.rawGeminiJson,
  };
  const { id: receiptId } = await deps.insertReceipt(receipt);

  const transaction: NewTransaction = {
    householdId: input.householdId,
    userId: input.userId,
    amountCents: input.amountCents,
    merchant: input.merchant,
    categoryId: input.categoryId,
    date: input.date,
    note: input.note,
    receiptId,
  };
  return deps.createTransaction(transaction);
}

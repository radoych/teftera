import { saveReceiptTransaction, type SaveReceiptInput } from './save';

const input: SaveReceiptInput = {
  householdId: 'H',
  userId: 'U',
  storagePath: 'H/abc.jpg',
  rawGeminiJson: { merchant: 'Kaufland' },
  amountCents: 1420,
  merchant: 'Kaufland',
  categoryId: 'cat-groceries',
  date: '2026-06-20',
  note: 'Кафе, Мъфин',
};

describe('saveReceiptTransaction', () => {
  it('inserts the receipt first, then the transaction linked by receipt_id', async () => {
    const calls: string[] = [];
    const insertReceipt = jest.fn(async () => {
      calls.push('receipt');
      return { id: 'receipt-1' };
    });
    const createTransaction = jest.fn(async () => {
      calls.push('transaction');
    });

    await saveReceiptTransaction(input, { insertReceipt, createTransaction });

    expect(calls).toEqual(['receipt', 'transaction']);
    expect(insertReceipt).toHaveBeenCalledWith({
      householdId: 'H',
      userId: 'U',
      storagePath: 'H/abc.jpg',
      rawGeminiJson: { merchant: 'Kaufland' },
    });
    expect(createTransaction).toHaveBeenCalledWith({
      householdId: 'H',
      userId: 'U',
      amountCents: 1420,
      merchant: 'Kaufland',
      categoryId: 'cat-groceries',
      date: '2026-06-20',
      note: 'Кафе, Мъфин',
      receiptId: 'receipt-1',
    });
  });

  it('does not create a transaction when the receipt insert fails', async () => {
    const insertReceipt = jest.fn(async () => {
      throw new Error('insert failed');
    });
    const createTransaction = jest.fn(async () => {});

    await expect(
      saveReceiptTransaction(input, { insertReceipt, createTransaction }),
    ).rejects.toThrow('insert failed');
    expect(createTransaction).not.toHaveBeenCalled();
  });
});

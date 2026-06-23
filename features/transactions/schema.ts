import { z } from 'zod';
import { parseAmountToCents } from '@/lib/formatCurrency';
import { isValidISODate } from '@/lib/dates';

export interface ManualEntryParsed {
  amountCents: number;
  merchant: string;
  note: string | null;
  date: string; // YYYY-MM-DD
}

export type ManualEntryErrors = {
  amount?: string;
  merchant?: string;
  date?: string;
};

const schema = z.object({
  amount: z
    .string()
    .refine((s) => {
      const cents = parseAmountToCents(s);
      return cents !== null && cents > 0;
    }, 'Въведи сума по-голяма от 0'),
  merchant: z.string().trim().min(1, 'Въведи търговец'),
  note: z.string(),
  date: z.string().refine(isValidISODate, 'Невалидна дата'),
});

/** Validate raw form strings; on success return integer-cents parsed data. */
export function parseManualEntry(values: {
  amount: string;
  merchant: string;
  note: string;
  date: string;
}):
  | { success: true; data: ManualEntryParsed }
  | { success: false; errors: ManualEntryErrors } {
  const result = schema.safeParse(values);
  if (!result.success) {
    const errors: ManualEntryErrors = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if (field === 'amount' && !errors.amount) errors.amount = issue.message;
      if (field === 'merchant' && !errors.merchant) errors.merchant = issue.message;
      if (field === 'date' && !errors.date) errors.date = issue.message;
    }
    return { success: false, errors };
  }
  const trimmedNote = result.data.note.trim();
  return {
    success: true,
    data: {
      // parseAmountToCents already validated non-null > 0 above.
      amountCents: parseAmountToCents(result.data.amount) as number,
      merchant: result.data.merchant.trim(),
      note: trimmedNote === '' ? null : trimmedNote,
      date: result.data.date,
    },
  };
}

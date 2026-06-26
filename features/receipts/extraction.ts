import type { ReceiptExtraction } from '@/services/gemini';
import { centsToInput, parseAmountToCents } from '@/lib/formatCurrency';
import { toISODate } from '@/lib/dates';

/** Editable line item as held in the confirm-receipt screen state. */
export interface ReceiptFormItem {
  id: string;
  description: string;
  amount: string; // comma-decimal major units, e.g. "5,40"
}

/** Seed values for the confirm-receipt form, derived from a Gemini extraction. */
export interface ReceiptFormSeed {
  merchant: string;
  total: string; // comma-decimal major units, '' when not detected
  date: string; // YYYY-MM-DD
  items: ReceiptFormItem[];
}

/** Comma-join non-empty (trimmed) item descriptions for the transaction note. */
export function itemsToNote(items: { description: string }[]): string {
  return items
    .map((i) => i.description.trim())
    .filter((d) => d.length > 0)
    .join(', ');
}

/** Sum the item amount inputs in integer cents (unparseable → 0). */
export function itemsSumCents(items: { amount: string }[]): number {
  return items.reduce((sum, i) => sum + (parseAmountToCents(i.amount) ?? 0), 0);
}

/** Map a Gemini extraction to editable form seed values. */
export function extractionToForm(extraction: ReceiptExtraction): ReceiptFormSeed {
  return {
    merchant: extraction.merchant,
    total: extraction.totalCents > 0 ? centsToInput(extraction.totalCents) : '',
    date: extraction.date ?? toISODate(),
    items: extraction.items.map((it, index) => ({
      id: String(index),
      description: it.description,
      amount: centsToInput(it.amountCents),
    })),
  };
}

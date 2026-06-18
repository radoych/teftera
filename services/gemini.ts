/**
 * Gemini chokepoint — the ONLY place LLM calls live (CLAUDE.md rule).
 *
 * Everything is isolated here so it can move to a Cloud Run service later
 * without touching screens. Every parse is wrapped in try/catch and falls back
 * to a null/`ok:false` result so the UI can route to the manual-edit screen.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL = 'gemini-2.0-flash';
const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';

export const isGeminiConfigured = Boolean(apiKey);

/** A single parsed receipt line item (amounts in integer EUR cents). */
export interface ReceiptLineItem {
  description: string;
  amountCents: number;
}

/** Structured result of a receipt extraction. Amounts are integer EUR cents. */
export interface ReceiptExtraction {
  merchant: string;
  /** ISO date (YYYY-MM-DD) or null if not detected. */
  date: string | null;
  totalCents: number;
  currency: 'EUR' | 'BGN';
  items: ReceiptLineItem[];
}

export type ExtractionResult =
  | { ok: true; data: ReceiptExtraction; raw: unknown }
  | { ok: false; reason: string };

const EXTRACTION_PROMPT = `You are a receipt parser. Extract the data from this receipt image.
Return ONLY valid minified JSON (no markdown fences) with this exact shape:
{"merchant": string, "date": "YYYY-MM-DD"|null, "total": number, "currency": "EUR"|"BGN", "items": [{"description": string, "amount": number}]}
Amounts are decimal major units (e.g. 12.50). Use EUR unless the receipt is clearly in Bulgarian leva (лв/BGN).`;

function toCents(major: unknown): number {
  const n = typeof major === 'number' ? major : Number(major);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function normalize(raw: unknown): ReceiptExtraction {
  const obj = raw as Record<string, unknown>;
  const currency = obj.currency === 'BGN' ? 'BGN' : 'EUR';
  const items = Array.isArray(obj.items)
    ? obj.items.map((it) => {
        const item = it as Record<string, unknown>;
        return {
          description: String(item.description ?? ''),
          amountCents: toCents(item.amount),
        };
      })
    : [];
  return {
    merchant: String(obj.merchant ?? ''),
    date: typeof obj.date === 'string' ? obj.date : null,
    totalCents: toCents(obj.total),
    currency,
    items,
  };
}

/**
 * Extract structured data from a base64-encoded receipt image.
 * Never throws — returns `{ ok: false }` so callers can fall back to manual entry.
 */
export async function extractReceipt(
  base64Image: string,
  mimeType = 'image/jpeg',
): Promise<ExtractionResult> {
  if (!isGeminiConfigured) {
    return { ok: false, reason: 'Gemini API key not configured.' };
  }

  try {
    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({ model: MODEL });

    const response = await model.generateContent([
      EXTRACTION_PROMPT,
      { inlineData: { data: base64Image, mimeType } },
    ]);

    const text = response.response.text().trim();
    const jsonText = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

    const parsed: unknown = JSON.parse(jsonText);
    if (__DEV__) {
      console.log('[gemini] receipt extraction raw:', jsonText);
    }
    return { ok: true, data: normalize(parsed), raw: parsed };
  } catch (err) {
    if (__DEV__) {
      console.warn('[gemini] extraction failed, falling back to manual entry:', err);
    }
    return { ok: false, reason: 'Could not read the receipt automatically.' };
  }
}

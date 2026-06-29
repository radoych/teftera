/**
 * Gemini chokepoint — the ONLY place LLM calls live (CLAUDE.md rule).
 *
 * Everything is isolated here so it can move to a Cloud Run service later
 * without touching screens. Every parse is wrapped in try/catch and falls back
 * to a null/`ok:false` result so the UI can route to the manual-edit screen.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { formatCurrency } from '@/lib/formatCurrency';

// Receipt extraction model. Stable GA model: in testing it returned 0 errors
// where `gemini-3-flash-preview` 503'd ("high demand") on ~3/4 of calls — the
// preview tier is heavily throttled. `gemini-2.0-flash` free tier is limit:0 here.
const MODEL = 'gemini-2.5-flash';
// Transient errors are retried (see isRetryableGeminiError); a one-off 503 should
// not drop the user to a blank manual form.
const MAX_ATTEMPTS = 3;
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

/** Compact current-month spend snapshot fed to the summary prompt. Amounts are integer EUR cents. */
export interface SummaryInput {
  monthTotalCents: number;
  prevMonthTotalCents: number;
  pctChange: number | null;
  topCategory: { name: string; totalCents: number } | null;
  topMerchant: { merchant: string; totalCents: number } | null;
}

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

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * True for transient Gemini/network errors that are worth retrying — an
 * overloaded model (503), rate limiting (429), other 5xx, or a network blip.
 * A JSON parse error is NOT retryable (the response arrived, just malformed).
 */
export function isRetryableGeminiError(err: unknown): boolean {
  const msg = String((err as { message?: string } | null)?.message ?? err);
  return /\[(?:429|500|502|503|504)\b/.test(msg) || /fetch failed|network|ECONNRESET|ETIMEDOUT|timeout/i.test(msg);
}

/**
 * Extract structured data from a base64-encoded receipt image.
 * Retries transient failures (overloaded model / network) up to MAX_ATTEMPTS with
 * backoff. Never throws — returns `{ ok: false }` so callers fall back to manual entry.
 */
export async function extractReceipt(
  base64Image: string,
  mimeType = 'image/jpeg',
): Promise<ExtractionResult> {
  if (!isGeminiConfigured) {
    return { ok: false, reason: 'Gemini API key not configured.' };
  }

  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({ model: MODEL });
  let lastErr: unknown = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await delay(500 * 2 ** (attempt - 1)); // 500ms, 1000ms
    try {
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
      lastErr = err;
      if (!isRetryableGeminiError(err)) break; // malformed JSON etc. won't improve on retry
      if (__DEV__) {
        console.warn(`[gemini] attempt ${attempt + 1}/${MAX_ATTEMPTS} transient failure, retrying`);
      }
    }
  }

  if (__DEV__) {
    console.warn('[gemini] extraction failed, falling back to manual entry:', lastErr);
  }
  return { ok: false, reason: 'Could not read the receipt automatically.' };
}

const SUMMARY_MAX_CHARS = 400;

/** Build the Bulgarian summary prompt from pre-aggregated current-month data. */
export function buildSummaryPrompt(input: SummaryInput): string {
  const lines = [`Общо този месец: ${formatCurrency(input.monthTotalCents)}`];
  if (input.pctChange !== null) {
    const dir = input.pctChange >= 0 ? 'повече' : 'по-малко';
    lines.push(
      `Миналия месец: ${formatCurrency(input.prevMonthTotalCents)} (с ${Math.abs(input.pctChange)}% ${dir})`,
    );
  }
  if (input.topCategory) {
    lines.push(`Най-голяма категория: ${input.topCategory.name} (${formatCurrency(input.topCategory.totalCents)})`);
  }
  if (input.topMerchant) {
    lines.push(`Топ търговец: ${input.topMerchant.merchant} (${formatCurrency(input.topMerchant.totalCents)})`);
  }
  return [
    'Ти си финансов асистент. На база данните по-долу за текущия месец напиши кратко',
    'обобщение от 2-3 изречения на български. Само обикновен текст, без markdown.',
    '',
    ...lines,
  ].join('\n');
}

/**
 * Generate a short natural-language spend summary. Returns plain Bulgarian text,
 * or `null` when not configured, on any error, or when the response is empty or
 * suspiciously long. Best-effort — never throws; retries transient failures.
 */
export async function generateInsightsSummary(input: SummaryInput): Promise<string | null> {
  if (!isGeminiConfigured) return null;

  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({ model: MODEL });
  const prompt = buildSummaryPrompt(input);
  let lastErr: unknown = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await delay(500 * 2 ** (attempt - 1));
    try {
      const response = await model.generateContent(prompt);
      const text = response.response.text().trim();
      if (text.length === 0 || text.length > SUMMARY_MAX_CHARS) return null;
      if (__DEV__) console.log('[gemini] insights summary:', text);
      return text;
    } catch (err) {
      lastErr = err;
      if (!isRetryableGeminiError(err)) break;
      if (__DEV__) {
        console.warn(`[gemini] summary attempt ${attempt + 1}/${MAX_ATTEMPTS} transient failure, retrying`);
      }
    }
  }
  if (__DEV__) console.warn('[gemini] summary failed, hiding card:', lastErr);
  return null;
}

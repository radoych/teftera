/**
 * Gemini chokepoint — the ONLY place LLM calls live (CLAUDE.md rule).
 *
 * Gemini now runs server-side behind two Supabase Edge Functions
 * (`gemini-extract`, `gemini-summary`) — this module is a thin client that
 * calls them with the user's JWT. The API key never ships in the client
 * bundle. Everything is still isolated here so it can move to a Cloud Run
 * service later without touching screens. Every parse is wrapped in try/catch
 * and falls back to a null/`ok:false` result so the UI can route to the
 * manual-edit screen.
 */
import { isSupabaseConfigured } from '@/services/supabase';
import { invokeEdgeJson, withRetry } from '@/services/edge';
import { formatCurrency } from '@/lib/formatCurrency';

export { isRetryableStatus } from '@/services/edge';

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
 * Retries transient failures (overloaded model / network) with backoff. Never
 * throws — returns `{ ok: false }` so callers fall back to manual entry.
 */
export async function extractReceipt(
  base64Image: string,
  mimeType = 'image/jpeg',
): Promise<ExtractionResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, reason: 'Gemini API key not configured.' };
  }

  try {
    // Transient errors (429/5xx, network, malformed body) are retried with
    // backoff; a one-off 503 should not drop the user to a blank manual form.
    const { raw, data } = await withRetry(
      async () => {
        const { json: raw } = await invokeEdgeJson<{ json: unknown }>('gemini-extract', {
          image: base64Image,
          mimeType,
        });
        return { raw, data: normalize(raw) };
      },
      { label: '[gemini] extract' },
    );
    // Review #3: a zero/negative total means the model failed to read the
    // receipt — fall back to manual entry rather than saving a €0 row.
    if (data.totalCents <= 0) {
      return { ok: false, reason: 'Could not read the receipt automatically.' };
    }
    if (__DEV__) console.log('[gemini] receipt extraction:', JSON.stringify(raw));
    return { ok: true, data, raw };
  } catch (err) {
    if (__DEV__) {
      console.warn('[gemini] extraction failed, falling back to manual entry:', err);
    }
    return { ok: false, reason: 'Could not read the receipt automatically.' };
  }
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
  if (!isSupabaseConfigured) return null;

  try {
    const { text } = await withRetry(
      () => invokeEdgeJson<{ text: string }>('gemini-summary', { prompt: buildSummaryPrompt(input) }),
      { label: '[gemini] summary' },
    );
    const trimmed = (text ?? '').trim();
    if (trimmed.length === 0 || trimmed.length > SUMMARY_MAX_CHARS) return null;
    if (__DEV__) console.log('[gemini] insights summary:', trimmed);
    return trimmed;
  } catch (err) {
    if (__DEV__) console.warn('[gemini] summary failed, hiding card:', err);
    return null;
  }
}

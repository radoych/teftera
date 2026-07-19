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
import { isSupabaseConfigured, supabase } from '@/services/supabase';
import { formatCurrency } from '@/lib/formatCurrency';

/** Gemini now runs server-side; "configured" = Supabase reachable. */
export const isGeminiConfigured = isSupabaseConfigured;

const FUNCTIONS_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''}/functions/v1`;
// Transient errors are retried (see isRetryableStatus); a one-off 503 should
// not drop the user to a blank manual form.
const MAX_ATTEMPTS = 3;
export const RETRY_BASE_MS = 500;

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

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * True for transient statuses worth retrying — rate limiting (429) or an
 * upstream/server failure (5xx). 4xx statuses (bad request, unauthenticated,
 * unparseable response) will not improve on retry.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 504);
}

/** Calls one of the Gemini edge functions with the current session's JWT. */
async function callGeminiFn(name: string, body: unknown): Promise<Response> {
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
    body: JSON.stringify(body),
  });
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

  let lastErr: unknown = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await delay(RETRY_BASE_MS * 2 ** (attempt - 1)); // 500ms, 1000ms
    try {
      const res = await callGeminiFn('gemini-extract', { image: base64Image, mimeType });
      if (!res.ok) {
        lastErr = new Error(`gemini-extract ${res.status}`);
        if (!isRetryableStatus(res.status)) break; // 4xx — won't improve on retry
        if (__DEV__) {
          console.warn(`[gemini] attempt ${attempt + 1}/${MAX_ATTEMPTS} transient failure, retrying`);
        }
        continue;
      }

      const { json: raw } = (await res.json()) as { json: unknown };
      const data = normalize(raw);
      // Review #3: a zero/negative total means the model failed to read the
      // receipt — fall back to manual entry rather than saving a €0 row.
      if (data.totalCents <= 0) {
        return { ok: false, reason: 'Could not read the receipt automatically.' };
      }
      if (__DEV__) console.log('[gemini] receipt extraction:', JSON.stringify(raw));
      return { ok: true, data, raw };
    } catch (err) {
      lastErr = err; // network — retry
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

  const prompt = buildSummaryPrompt(input);
  let lastErr: unknown = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await delay(RETRY_BASE_MS * 2 ** (attempt - 1));
    try {
      const res = await callGeminiFn('gemini-summary', { prompt });
      if (!res.ok) {
        lastErr = new Error(`gemini-summary ${res.status}`);
        if (!isRetryableStatus(res.status)) break;
        if (__DEV__) {
          console.warn(`[gemini] summary attempt ${attempt + 1}/${MAX_ATTEMPTS} transient failure, retrying`);
        }
        continue;
      }

      const { text } = (await res.json()) as { text: string };
      const trimmed = (text ?? '').trim();
      if (trimmed.length === 0 || trimmed.length > SUMMARY_MAX_CHARS) return null;
      if (__DEV__) console.log('[gemini] insights summary:', trimmed);
      return trimmed;
    } catch (err) {
      lastErr = err;
    }
  }
  if (__DEV__) console.warn('[gemini] summary failed, hiding card:', lastErr);
  return null;
}

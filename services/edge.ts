/**
 * Supabase Edge Function client — the one place the app builds an edge-function
 * request (session JWT, `apikey`, JSON body) and the one retry policy.
 *
 * Hand-rolled `fetch` rather than `supabase.functions.invoke`: callers need the
 * raw HTTP status (retry policy, bank-sync's 409/429 mapping), which `invoke`
 * hides behind `FunctionsHttpError.context`.
 */
import { supabase } from '@/services/supabase';

const FUNCTIONS_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''}/functions/v1`;

/** A non-2xx edge-function response. */
export class EdgeHttpError extends Error {
  constructor(
    readonly fn: string,
    readonly status: number,
  ) {
    super(`${fn} ${status}`);
    this.name = 'EdgeHttpError';
  }
}

/**
 * POST to an edge function with the current session's JWT. Resolves with the
 * raw `Response` whatever its status; throws when signed out or on a network
 * failure. `body` omitted → no request body.
 */
export async function invokeEdge(name: string, body?: unknown): Promise<Response> {
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

/** `invokeEdge` + JSON decode; a non-2xx status throws `EdgeHttpError`. */
export async function invokeEdgeJson<T>(name: string, body?: unknown): Promise<T> {
  const res = await invokeEdge(name, body);
  if (!res.ok) throw new EdgeHttpError(name, res.status);
  return (await res.json()) as T;
}

/**
 * True for transient statuses worth retrying — rate limiting (429) or an
 * upstream/server failure (5xx). 4xx statuses (bad request, unauthenticated,
 * unparseable response) will not improve on retry.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 504);
}

/**
 * Default retry predicate: an HTTP error retries only on a transient status;
 * anything else (network failure, malformed body) is assumed transient.
 */
export function isRetryableError(err: unknown): boolean {
  return err instanceof EdgeHttpError ? isRetryableStatus(err.status) : true;
}

export interface RetryOptions {
  /** Total attempts including the first. Default 3. */
  attempts?: number;
  /** Backoff before retry n (1-based) is `baseMs * 2^(n-1)`: 500ms, 1000ms… Default 500. */
  baseMs?: number;
  /** Whether a thrown error is worth another attempt. Default `isRetryableError`. */
  retryable?: (err: unknown) => boolean;
  /** Dev-log prefix for retry warnings, e.g. '[gemini] extract'. */
  label?: string;
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn` up to `attempts` times with exponential backoff, retrying only
 * errors `retryable` accepts. Resolves with the first success; rejects with
 * the last error.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  { attempts = 3, baseMs = 500, retryable = isRetryableError, label = '[edge]' }: RetryOptions = {},
): Promise<T> {
  let lastErr: unknown = new Error('withRetry: no attempts');
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await delay(baseMs * 2 ** (attempt - 1));
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (!retryable(err)) break;
      if (__DEV__ && attempt + 1 < attempts) {
        console.warn(`${label} attempt ${attempt + 1}/${attempts} transient failure, retrying`);
      }
    }
  }
  throw lastErr;
}

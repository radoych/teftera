import { supabase } from '@/services/supabase';
import {
  EdgeHttpError,
  invokeEdge,
  invokeEdgeJson,
  isRetryableError,
  isRetryableStatus,
  withRetry,
} from './edge';

declare const global: {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

jest.mock('@/services/supabase', () => ({
  supabase: { auth: { getSession: jest.fn() } },
}));

const getSession = supabase.auth.getSession as jest.Mock;

const mockFetch = (status: number, body: unknown) => {
  const f = jest.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });
  global.fetch = f as unknown as typeof fetch;
  return f;
};

beforeEach(() => {
  getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('invokeEdge', () => {
  it('POSTs JSON to the named function with the session JWT and apikey', async () => {
    const f = mockFetch(200, {});
    await invokeEdge('gemini-summary', { prompt: 'x' });
    const [url, init] = f.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toMatch(/\/functions\/v1\/gemini-summary$/);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(typeof init.headers.apikey).toBe('string');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{"prompt":"x"}');
  });

  it('sends no body when none is given', async () => {
    const f = mockFetch(200, {});
    await invokeEdge('bank-sync-transactions');
    expect((f.mock.calls[0] as [string, RequestInit])[1].body).toBeUndefined();
  });

  it('returns non-2xx responses as-is (callers map statuses)', async () => {
    mockFetch(409, { error: 'not_connected' });
    const res = await invokeEdge('bank-sync-transactions');
    expect(res.status).toBe(409);
  });

  it('throws without a session and never calls fetch', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const f = mockFetch(200, {});
    await expect(invokeEdge('x')).rejects.toThrow('not signed in');
    expect(f).not.toHaveBeenCalled();
  });
});

describe('invokeEdgeJson', () => {
  it('decodes a 2xx body', async () => {
    mockFetch(200, { text: 'hi' });
    await expect(invokeEdgeJson<{ text: string }>('gemini-summary', {})).resolves.toEqual({ text: 'hi' });
  });

  it('throws EdgeHttpError carrying the status on non-2xx', async () => {
    mockFetch(503, { error: 'gemini_error' });
    const err: unknown = await invokeEdgeJson('gemini-extract', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EdgeHttpError);
    expect((err as EdgeHttpError).status).toBe(503);
    expect((err as EdgeHttpError).fn).toBe('gemini-extract');
  });
});

describe('isRetryableStatus / isRetryableError', () => {
  it('retries 429 and 5xx, not 4xx', () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(504)).toBe(true);
    expect(isRetryableStatus(422)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
  });

  it('treats HTTP errors by status and anything else (network, parse) as transient', () => {
    expect(isRetryableError(new EdgeHttpError('f', 503))).toBe(true);
    expect(isRetryableError(new EdgeHttpError('f', 400))).toBe(false);
    expect(isRetryableError(new TypeError('Network request failed'))).toBe(true);
  });
});

describe('withRetry', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns the first success without waiting', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    await expect(withRetry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries transient failures with 500ms then 1000ms backoff, then rethrows the last error', async () => {
    const fn = jest.fn().mockRejectedValue(new EdgeHttpError('f', 503));
    const p = withRetry(fn);
    const settled = p.catch((e: unknown) => e);

    await jest.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(499);
    expect(fn).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(3);

    const err = await settled;
    expect(err).toBeInstanceOf(EdgeHttpError);
  });

  it('stops at the first non-retryable error', async () => {
    const fn = jest.fn().mockRejectedValue(new EdgeHttpError('f', 422));
    await expect(withRetry(fn)).rejects.toBeInstanceOf(EdgeHttpError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('recovers when a retry succeeds and passes the attempt index', async () => {
    const fn = jest
      .fn<Promise<string>, [number]>()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce('ok');
    const p = withRetry(fn);
    await jest.advanceTimersByTimeAsync(500);
    await expect(p).resolves.toBe('ok');
    expect(fn.mock.calls.map((c) => c[0])).toEqual([0, 1]);
  });

  it('honours custom attempts and retryable', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('x'));
    await expect(withRetry(fn, { attempts: 1 })).rejects.toThrow('x');
    expect(fn).toHaveBeenCalledTimes(1);

    const never = jest.fn().mockRejectedValue(new Error('y'));
    await expect(withRetry(never, { retryable: () => false })).rejects.toThrow('y');
    expect(never).toHaveBeenCalledTimes(1);
  });
});

import { extractReceipt, generateInsightsSummary, isRetryableStatus, buildSummaryPrompt, type SummaryInput } from './gemini';

declare const global: {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

jest.mock('@/services/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'jwt' } } }) },
  },
}));

const mockFetch = (status: number, body: unknown) =>
  jest.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });

describe('isRetryableStatus', () => {
  it('retries 429 and 5xx, not 4xx', () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(422)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
  });
});

describe('extractReceipt', () => {
  beforeEach(() => jest.useFakeTimers({ advanceTimers: true }));
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('maps a good response to normalized cents', async () => {
    global.fetch = mockFetch(200, {
      json: { merchant: 'Lidl', date: '2026-07-01', total: 12.5, currency: 'EUR', items: [] },
    }) as never;
    const r = await extractReceipt('AAAA');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.totalCents).toBe(1250);
  });

  it('rejects a zero/missing total as extraction failure (review #3)', async () => {
    global.fetch = mockFetch(200, {
      json: { merchant: 'Lidl', date: null, currency: 'EUR', items: [] },
    }) as never;
    const r = await extractReceipt('AAAA');
    expect(r.ok).toBe(false);
  });

  it('does not retry a 422 and falls back', async () => {
    const f = mockFetch(422, { error: 'bad_response' });
    global.fetch = f as never;
    const r = await extractReceipt('AAAA');
    expect(r.ok).toBe(false);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('retries a 503 up to 3 attempts', async () => {
    const f = mockFetch(503, { error: 'gemini_error' });
    global.fetch = f as never;
    const r = await extractReceipt('AAAA');
    expect(r.ok).toBe(false);
    expect(f).toHaveBeenCalledTimes(3);
  });
});

describe('generateInsightsSummary', () => {
  beforeEach(() => jest.useFakeTimers({ advanceTimers: true }));
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('returns trimmed text on success', async () => {
    global.fetch = mockFetch(200, { text: 'Кратко обобщение.' }) as never;
    const input = { monthTotalCents: 1000, prevMonthTotalCents: 0, pctChange: null, topCategory: null, topMerchant: null };
    await expect(generateInsightsSummary(input)).resolves.toBe('Кратко обобщение.');
  });
  it('null on over-long text', async () => {
    global.fetch = mockFetch(200, { text: 'x'.repeat(500) }) as never;
    const input = { monthTotalCents: 1000, prevMonthTotalCents: 0, pctChange: null, topCategory: null, topMerchant: null };
    await expect(generateInsightsSummary(input)).resolves.toBeNull();
  });
});

describe('buildSummaryPrompt', () => {
  const full: SummaryInput = {
    monthTotalCents: 82000,
    prevMonthTotalCents: 73000,
    pctChange: 12,
    topCategory: { name: 'Хранене', totalCents: 31000 },
    topMerchant: { merchant: 'Kaufland', totalCents: 14000 },
  };

  it('includes the formatted total, MoM line, top category and merchant', () => {
    const p = buildSummaryPrompt(full);
    expect(p).toContain('Общо този месец: €820,00');
    expect(p).toContain('€730,00 (с 12% повече)');
    expect(p).toContain('Хранене (€310,00)');
    expect(p).toContain('Kaufland (€140,00)');
  });

  it('uses "по-малко" when spending dropped', () => {
    expect(buildSummaryPrompt({ ...full, pctChange: -8 })).toContain('(с 8% по-малко)');
  });

  it('omits optional lines when their inputs are null', () => {
    const p = buildSummaryPrompt({
      monthTotalCents: 5000,
      prevMonthTotalCents: 0,
      pctChange: null,
      topCategory: null,
      topMerchant: null,
    });
    expect(p).toContain('Общо този месец: €50,00');
    expect(p).not.toContain('Миналия месец');
    expect(p).not.toContain('Най-голяма категория');
    expect(p).not.toContain('Топ търговец');
  });
});

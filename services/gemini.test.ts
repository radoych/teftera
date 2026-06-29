import { buildSummaryPrompt, isRetryableGeminiError, type SummaryInput } from './gemini';

describe('isRetryableGeminiError', () => {
  it('retries an overloaded model (503)', () => {
    expect(
      isRetryableGeminiError(
        new Error(
          '[GoogleGenerativeAI Error]: Error fetching from .../gemini-2.5-flash:generateContent: [503 Service Unavailable] This model is currently experiencing high demand.',
        ),
      ),
    ).toBe(true);
  });

  it('retries rate limiting (429) and other 5xx', () => {
    expect(isRetryableGeminiError(new Error('[429 Too Many Requests] quota'))).toBe(true);
    expect(isRetryableGeminiError(new Error('[500 Internal Server Error]'))).toBe(true);
    expect(isRetryableGeminiError(new Error('[502 Bad Gateway]'))).toBe(true);
  });

  it('retries network-level failures', () => {
    expect(isRetryableGeminiError(new Error('fetch failed'))).toBe(true);
    expect(isRetryableGeminiError(new Error('network request timeout'))).toBe(true);
  });

  it('does NOT retry a malformed-JSON parse error', () => {
    expect(isRetryableGeminiError(new SyntaxError('Unexpected token < in JSON at position 0'))).toBe(false);
  });

  it('does NOT retry a 400 bad request', () => {
    expect(isRetryableGeminiError(new Error('[400 Bad Request] invalid argument'))).toBe(false);
  });

  it('handles non-Error values without throwing', () => {
    expect(isRetryableGeminiError('503 plain string')).toBe(false); // no bracket form
    expect(isRetryableGeminiError(null)).toBe(false);
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

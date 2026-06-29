import { isRetryableGeminiError } from './gemini';

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

// POST { prompt } → { text } — short Bulgarian spend summary. Prompt is built
// client-side from pre-aggregated numbers; server caps its size.
import { getCallerHousehold, json } from '../_shared/auth.ts';

const MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_PROMPT_CHARS = 2000;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const caller = await getCallerHousehold(req);
  if (!caller) return json(401, { error: 'unauthorized' });
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) return json(500, { error: 'not_configured' });

  let body: { prompt?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'bad_request' });
  }
  if (typeof body.prompt !== 'string' || body.prompt.length === 0 || body.prompt.length > MAX_PROMPT_CHARS) {
    return json(400, { error: 'bad_request' });
  }

  const res = await fetch(`${GEMINI_URL}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: body.prompt }] }] }),
  });
  if (res.status === 429) return json(429, { error: 'rate_limited' });
  if (!res.ok) {
    console.error('[gemini-summary] upstream', res.status, await res.text());
    return json(502, { error: 'gemini_error' });
  }
  try {
    const data = await res.json();
    const text: unknown = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string' || text.trim().length === 0) throw new Error('empty');
    return json(200, { text: text.trim() });
  } catch (err) {
    console.error('[gemini-summary] bad response', err);
    return json(422, { error: 'bad_response' });
  }
});

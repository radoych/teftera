// POST { image, mimeType? } → { json } — receipt extraction via Gemini with a
// structured-output schema. GEMINI_API_KEY exists only here, server-side.
import { getCallerHousehold, json } from '../_shared/auth.ts';

const MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
// The client sends a downscaled JPEG (~300–500 KB of base64). Anything past this
// cap is a runaway client burning Gemini quota → 413. ~2 MB of base64 ≈ 1.5 MB image.
const MAX_IMAGE_BASE64_CHARS = 2_000_000;
// Whole-body guard checked before parsing, so an oversized request is never buffered
// into JSON. Leaves headroom for the JSON wrapper and mimeType.
const MAX_BODY_BYTES = MAX_IMAGE_BASE64_CHARS + 4_096;

const EXTRACTION_PROMPT = `You are a receipt parser. Extract the data from this receipt image.
Amounts are decimal major units (e.g. 12.50). Use EUR unless the receipt is clearly in Bulgarian leva (лв/BGN). date is the receipt date as YYYY-MM-DD, or null if not visible.`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    merchant: { type: 'STRING' },
    date: { type: 'STRING', nullable: true },
    total: { type: 'NUMBER' },
    currency: { type: 'STRING', enum: ['EUR', 'BGN'] },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { description: { type: 'STRING' }, amount: { type: 'NUMBER' } },
        required: ['description', 'amount'],
      },
    },
  },
  required: ['merchant', 'total', 'currency', 'items'],
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const caller = await getCallerHousehold(req);
  if (!caller) return json(401, { error: 'unauthorized' });
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) return json(500, { error: 'not_configured' });

  const declaredLength = Number(req.headers.get('Content-Length') ?? '0');
  if (declaredLength > MAX_BODY_BYTES) return json(413, { error: 'payload_too_large' });

  let body: { image?: unknown; mimeType?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'bad_request' });
  }
  if (typeof body.image !== 'string' || body.image.length === 0) {
    return json(400, { error: 'bad_request' });
  }
  if (body.image.length > MAX_IMAGE_BASE64_CHARS) {
    return json(413, { error: 'payload_too_large' });
  }
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType : 'image/jpeg';

  const res = await fetch(`${GEMINI_URL}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        { parts: [{ text: EXTRACTION_PROMPT }, { inline_data: { mime_type: mimeType, data: body.image } }] },
      ],
      generationConfig: { response_mime_type: 'application/json', response_schema: RESPONSE_SCHEMA },
    }),
  });
  if (res.status === 429) return json(429, { error: 'rate_limited' });
  if (!res.ok) {
    console.error('[gemini-extract] upstream', res.status, await res.text());
    return json(502, { error: 'gemini_error' });
  }
  try {
    const data = await res.json();
    const text: unknown = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string') throw new Error('no text part');
    return json(200, { json: JSON.parse(text) });
  } catch (err) {
    console.error('[gemini-extract] bad response', err);
    return json(422, { error: 'bad_response' });
  }
});

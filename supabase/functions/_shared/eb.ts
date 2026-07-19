// Shared Enable Banking helpers for the bank-sync Edge Functions.
// Secrets (EB_APP_ID, EB_PRIVATE_KEY, EB_STATE_SECRET) exist only here,
// server-side.
import * as jose from 'npm:jose@5';

export { json, adminClient, getCallerHousehold } from './auth.ts';

const EB_API = 'https://api.enablebanking.com';
const enc = new TextEncoder();

/**
 * The private key secret is stored base64-encoded (single line — multi-line
 * secret values get truncated by the CLI on Windows). A raw PEM still works.
 */
function privateKeyPem(): string {
  const raw = Deno.env.get('EB_PRIVATE_KEY');
  if (!raw) throw new Error('EB_PRIVATE_KEY is not set');
  if (raw.includes('BEGIN')) return raw;
  return new TextDecoder().decode(Uint8Array.from(atob(raw), (c) => c.charCodeAt(0)));
}

/** Mint a short-lived EB API JWT (RS256, kid = application id). */
async function mintEbJwt(): Promise<string> {
  const key = await jose.importPKCS8(privateKeyPem(), 'RS256');
  return await new jose.SignJWT({})
    .setProtectedHeader({ typ: 'JWT', alg: 'RS256', kid: Deno.env.get('EB_APP_ID')! })
    .setIssuer('enablebanking.com')
    .setAudience('api.enablebanking.com')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
}

export async function ebFetch(path: string, init?: RequestInit): Promise<Response> {
  const jwt = await mintEbJwt();
  return await fetch(`${EB_API}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
  });
}

/** OAuth `state`: HMAC-signed so the (unauthenticated) callback can trust it. */
export interface StatePayload {
  h: string; // household_id
  u: string; // user_id
  r: string; // return deep link into the app
  exp: number; // unix seconds
}

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmacKey(usage: KeyUsage): Promise<CryptoKey> {
  const secret = Deno.env.get('EB_STATE_SECRET');
  if (!secret) throw new Error('EB_STATE_SECRET is not set');
  return await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );
}

export async function signState(p: StatePayload): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(p)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey('sign'), enc.encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

export async function verifyState(state: string): Promise<StatePayload | null> {
  const [body, sig] = state.split('.');
  if (!body || !sig) return null;
  const sigBytes = Uint8Array.from(
    atob(sig.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0),
  );
  const ok = await crypto.subtle.verify('HMAC', await hmacKey('verify'), sigBytes, enc.encode(body));
  if (!ok) return null;
  try {
    const payload = JSON.parse(
      atob(body.replace(/-/g, '+').replace(/_/g, '/')),
    ) as StatePayload;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}


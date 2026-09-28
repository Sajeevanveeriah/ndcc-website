import { createHash, createHmac } from 'node:crypto';

// Guest spin passes. The link token is HMAC-SHA256(secret, pass id), so the
// server can re-derive and re-send it at any time; the database stores only
// SHA-256(token). SPIN_WHEEL_PASS_SECRET is preferred; without it the service
// role key is used with a domain-separation label. Rotating the secret
// invalidates existing links (they can be re-sent from the page).

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const LABEL = 'ndcc:spin-wheel-pass:v1:';

function passSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.SPIN_WHEEL_PASS_SECRET || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('Spin pass secret is not configured.');
  return secret;
}

export function spinPassToken(passId: string, env?: Record<string, string | undefined>): string {
  return createHmac('sha256', passSecret(env)).update(`${LABEL}${passId}`).digest('base64url');
}

export function hashSpinPassToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function isSpinPassToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value);
}

export function spinPassUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/spin-the-wheel?pass=${encodeURIComponent(token)}`;
}

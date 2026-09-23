import 'server-only';
// Optional Cloudflare Turnstile verification.
//
// Turnstile is OFF unless TURNSTILE_SECRET_KEY is set AND TURNSTILE_ENFORCE=true. While it
// is unset every helper here is a no-op, so public forms behave exactly as
// before. Once it is set, submissions must carry a Turnstile token (from the
// client widget) in one of:
//   - JSON body field `turnstileToken` or `cf-turnstile-response`
//   - request header `x-turnstile-token`
// IMPORTANT: the public forms do not render the widget yet. Only set
// TURNSTILE_ENFORCE=true once they do, otherwise every protected submission
// will be refused.

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERIFY_TIMEOUT_MS = 5_000;
const MAX_TOKEN_LENGTH = 2048;

export type TurnstileResult = { ok: true; skipped: boolean } | { ok: false; reason: 'missing_token' | 'invalid_token' | 'unavailable' };

// Enforcement also needs TURNSTILE_ENFORCE=true, so configuring the keys alone
// (e.g. while the client widget is being built) never blocks public forms.
export function isTurnstileEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.TURNSTILE_SECRET_KEY && env.TURNSTILE_SECRET_KEY.trim()) && env.TURNSTILE_ENFORCE === 'true';
}

export function readTurnstileToken(request: Request, body?: Record<string, unknown> | null): string | null {
  const candidates = [
    body?.turnstileToken,
    body?.['cf-turnstile-response'],
    request.headers.get('x-turnstile-token'),
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() && candidate.length <= MAX_TOKEN_LENGTH) return candidate.trim();
  }
  return null;
}

export async function verifyTurnstileToken(
  token: string | null,
  remoteIp: string | null,
  options: { env?: Record<string, string | undefined>; fetchImpl?: typeof fetch } = {},
): Promise<TurnstileResult> {
  const env = options.env ?? process.env;
  if (!isTurnstileEnabled(env)) return { ok: true, skipped: true };
  if (!token) return { ok: false, reason: 'missing_token' };

  const form = new URLSearchParams();
  form.set('secret', String(env.TURNSTILE_SECRET_KEY).trim());
  form.set('response', token);
  if (remoteIp && remoteIp !== 'unknown') form.set('remoteip', remoteIp);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const response = await (options.fetchImpl ?? fetch)(SITEVERIFY_URL, {
      method: 'POST',
      body: form,
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`siteverify HTTP ${response.status}`);
    const outcome = await response.json() as { success?: boolean; 'error-codes'?: string[] };
    if (outcome.success === true) return { ok: true, skipped: false };
    return { ok: false, reason: 'invalid_token' };
  } catch (error) {
    // Fail closed while enabled: an unverifiable submission is refused.
    console.error('[turnstile_unavailable]', { message: error instanceof Error ? error.message.slice(0, 160) : 'unknown' });
    return { ok: false, reason: 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}

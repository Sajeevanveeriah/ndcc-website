import 'server-only';
import { createHash } from 'node:crypto';
import { createServerClient } from '@/lib/supabase-server';
import { readTurnstileToken, verifyTurnstileToken } from '@/lib/server/turnstile';

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

/** One atomic counter shared by all function instances; never persist raw IPs or emails. */
export async function enforceRateLimit(key: string, maxRequests: number, windowMs: number): Promise<boolean> {
  try {
    // The atomic RPC is a write: allow cold connections to finish, but never
    // replay it or bypass the limiter when the service is unavailable.
    const { data, error } = await createServerClient({ fetchTimeoutMs: 15_000 }).rpc('ndcc_take_rate_limit', {
      p_key: createHash('sha256').update(key).digest('hex'),
      p_limit: maxRequests,
      p_window_ms: windowMs,
    });
    if (error) throw error;
    return data === true;
  } catch (error) {
    // Fail closed: a provider outage must not remove the login or payment
    // abuse controls, so the request is refused (callers answer 429).
    // Exactly one structured line is written per failed check. Vercel log
    // alerts / drains should match the literal prefix `[rate_limit_unavailable]`
    // to page when the shared limiter (ndcc_take_rate_limit RPC) is down.
    // Only the key scope is logged, never the raw IP or email in the key.
    const detail = error && typeof error === 'object' ? error as { code?: unknown; message?: unknown; name?: unknown } : {};
    console.error('[rate_limit_unavailable]', {
      scope: key.split(':')[0],
      limit: maxRequests,
      windowMs,
      code: typeof detail.code === 'string' ? detail.code : undefined,
      error: typeof detail.message === 'string' ? detail.message.slice(0, 160) : typeof detail.name === 'string' ? detail.name : 'unknown',
    });
    return false;
  }
}

export function enforceHoneypotAndTiming(honeypot?: string, submittedAt?: number, minMs = 1200): boolean {
  if (honeypot && honeypot.trim().length > 0) return false;
  if (!submittedAt || Number.isNaN(submittedAt)) return false;
  const elapsed = Date.now() - submittedAt;
  return elapsed >= minMs;
}

/**
 * Optional bot check for public forms. A no-op (always true) unless
 * TURNSTILE_SECRET_KEY is configured; see lib/server/turnstile.ts. Call it
 * after the honeypot/timing check with the parsed JSON body.
 */
export async function enforceTurnstile(request: Request, body?: Record<string, unknown> | null): Promise<boolean> {
  const result = await verifyTurnstileToken(readTurnstileToken(request, body), getClientIp(request));
  return result.ok;
}

import { createHash } from 'node:crypto';
import { createServerClient } from '@/lib/supabase-server';

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

/** One atomic counter shared by all function instances; never persist raw IPs or emails. */
export async function enforceRateLimit(key: string, maxRequests: number, windowMs: number): Promise<boolean> {
  try {
    const { data, error } = await createServerClient({ fetchTimeoutMs: 2500 }).rpc('ndcc_take_rate_limit', {
      p_key: createHash('sha256').update(key).digest('hex'),
      p_limit: maxRequests,
      p_window_ms: windowMs,
    });
    if (error) throw error;
    return data === true;
  } catch {
    // A provider outage must not remove the login or payment abuse controls.
    console.error(JSON.stringify({ event: 'rate_limit_unavailable', scope: key.split(':')[0] }));
    return false;
  }
}

export function enforceHoneypotAndTiming(honeypot?: string, submittedAt?: number, minMs = 1200): boolean {
  if (honeypot && honeypot.trim().length > 0) return false;
  if (!submittedAt || Number.isNaN(submittedAt)) return false;
  const elapsed = Date.now() - submittedAt;
  return elapsed >= minMs;
}

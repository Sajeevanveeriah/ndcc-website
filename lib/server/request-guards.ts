const requestBuckets = new Map<string, number[]>();

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

export function enforceRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = requestBuckets.get(key) || [];
  const recent = bucket.filter((timestamp) => now - timestamp < windowMs);

  if (recent.length >= maxRequests) {
    requestBuckets.set(key, recent);
    return false;
  }

  recent.push(now);
  requestBuckets.set(key, recent);
  return true;
}

export function enforceHoneypotAndTiming(honeypot?: string, submittedAt?: number, minMs = 1200): boolean {
  if (honeypot && honeypot.trim().length > 0) return false;
  if (!submittedAt || Number.isNaN(submittedAt)) return false;
  const elapsed = Date.now() - submittedAt;
  return elapsed >= minMs;
}

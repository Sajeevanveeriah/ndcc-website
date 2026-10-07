import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

// The full committee feed (private bookings, meetings) needs this key in its
// address. It is derived from a server-only secret, so no new setting is
// needed, and it is shown only to signed-in committee members.
function feedSecret(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

export function committeeFeedKey(secret: string | null = feedSecret()): string | null {
  if (!secret) return null;
  return createHmac('sha256', secret).update('ndcc-committee-calendar-feed-v1').digest('base64url').slice(0, 32);
}

export function isCommitteeFeedKey(value: string | null | undefined, secret: string | null = feedSecret()): boolean {
  const expected = committeeFeedKey(secret);
  if (!expected || typeof value !== 'string' || value.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

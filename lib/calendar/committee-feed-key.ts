import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { CLUB_ADMIN_ROLES, type AuthRole } from '@/lib/auth/config';
import { createServerClient } from '@/lib/supabase-server';

// The full committee feed (private bookings, meetings) needs a key in its
// address. Each committee member gets their own key, signed with a server-only
// secret: "<user id>.<signature>". A key stops working as soon as that member's
// admin account is deactivated or no longer has a committee role, so removing
// someone also cuts off any calendar app they subscribed with.
const KEY_PATTERN = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{32})$/;

function feedSecret(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

function signature(userId: string, secret: string): string {
  return createHmac('sha256', secret).update(`ndcc-committee-calendar-feed-v2:${userId}`).digest('base64url').slice(0, 32);
}

export function committeeFeedKey(userId: string, secret: string | null = feedSecret()): string | null {
  if (!secret) return null;
  return `${userId}.${signature(userId, secret)}`;
}

/** The member id a well-formed, correctly signed key belongs to (no account check). */
export function committeeFeedKeyUser(value: string | null | undefined, secret: string | null = feedSecret()): string | null {
  if (!secret || typeof value !== 'string') return null;
  const match = KEY_PATTERN.exec(value);
  if (!match) return null;
  const [, userId, received] = match;
  const expected = signature(userId, secret);
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected)) ? userId : null;
}

/** True only for a valid key whose member is still an active committee account. Fails closed. */
export async function isCommitteeFeedKey(value: string | null | undefined): Promise<boolean> {
  const userId = committeeFeedKeyUser(value);
  if (!userId) return false;
  try {
    const supabase = createServerClient({ fetchTimeoutMs: 5000 });
    const { data, error } = await supabase.from('committee_users').select('role, is_active').eq('id', userId).maybeSingle();
    if (error || !data) return false;
    return data.is_active === true && CLUB_ADMIN_ROLES.includes(data.role as AuthRole);
  } catch {
    return false;
  }
}

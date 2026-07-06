import crypto from 'crypto';
import { createServerClient } from '@/lib/supabase-server';
import { AUTH_COOKIE_NAME, AUTH_COOKIE_DOMAIN, AuthRole, SESSION_TTL_DAYS, SESSION_IDLE_TIMEOUT_MINUTES } from './config';

export interface CommitteeSessionUser {
  id: string;
  email: string;
  full_name: string;
  role: AuthRole;
}

export type SessionResolution =
  | {
      status: 'authenticated';
      user: CommitteeSessionUser;
      expiresAt: Date;
    }
  | {
      status: 'unauthenticated';
      reason: 'missing_token' | 'session_not_found' | 'expired' | 'inactive_user';
    }
  | {
      status: 'unavailable';
      reason: 'timeout' | 'database_error' | 'network_error';
    };

const SESSION_VALIDATION_TIMEOUT_MS = 5_000;

function classifySessionError(error: unknown): SessionResolution {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { status: 'unavailable', reason: 'timeout' };
  }

  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.message.toLowerCase().includes('abort')) {
      return { status: 'unavailable', reason: 'timeout' };
    }

    if (error.message.toLowerCase().includes('fetch')) {
      return { status: 'unavailable', reason: 'network_error' };
    }
  }

  return { status: 'unavailable', reason: 'database_error' };
}

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function sessionExpiryDate() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS);
  return expiresAt;
}

export function createAuthCookie(token: string, expiresAt: Date) {
  return {
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    domain: AUTH_COOKIE_DOMAIN,
    expires: expiresAt,
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  };
}

export function clearAuthCookie() {
  return {
    name: AUTH_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    domain: AUTH_COOKIE_DOMAIN,
    maxAge: 0,
  };
}

export async function resolveSessionFromToken(token?: string | null): Promise<SessionResolution> {
  if (!token) return { status: 'unauthenticated', reason: 'missing_token' };

  const supabase = createServerClient({ fetchTimeoutMs: SESSION_VALIDATION_TIMEOUT_MS });
  const tokenHash = hashSessionToken(token);

  try {
    // last_seen_at may not exist until the 20260706_admin_session_activity
    // migration is applied, so fall back to the legacy column set on a
    // missing-column error instead of locking every admin out.
    let hasLastSeenColumn = true;
    let query = await supabase
      .from('committee_sessions')
      .select('expires_at, last_seen_at, committee_users(id, email, full_name, role, is_active)')
      .eq('session_token_hash', tokenHash)
      .maybeSingle();

    if (query.error?.message?.includes('last_seen_at')) {
      hasLastSeenColumn = false;
      query = await supabase
        .from('committee_sessions')
        .select('expires_at, committee_users(id, email, full_name, role, is_active)')
        .eq('session_token_hash', tokenHash)
        .maybeSingle();
    }

    type SessionUserRow = { id: string; email: string; full_name: string; role: string; is_active: boolean };
    const { data, error } = query as unknown as {
      data: {
        expires_at: string;
        last_seen_at?: string | null;
        committee_users: SessionUserRow | SessionUserRow[] | null;
      } | null;
      error: { message: string } | null;
    };

    if (error) return { status: 'unavailable', reason: 'database_error' };
    if (!data) return { status: 'unauthenticated', reason: 'session_not_found' };

    const expiresAt = new Date(data.expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
      return { status: 'unauthenticated', reason: 'expired' };
    }

    if (hasLastSeenColumn && data.last_seen_at) {
      const lastSeenAt = new Date(data.last_seen_at);
      const idleLimitMs = SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000;
      if (!Number.isNaN(lastSeenAt.getTime()) && Date.now() - lastSeenAt.getTime() > idleLimitMs) {
        return { status: 'unauthenticated', reason: 'expired' };
      }
    }

    const rawUser = Array.isArray(data.committee_users) ? data.committee_users[0] : data.committee_users;

    if (!rawUser || !rawUser.is_active) return { status: 'unauthenticated', reason: 'inactive_user' };

    if (hasLastSeenColumn) {
      // Sliding-window refresh; throttled to once per 60s so busy admin screens
      // don't write on every request. Failures are non-fatal.
      const lastSeenMs = data.last_seen_at ? new Date(data.last_seen_at).getTime() : 0;
      if (!lastSeenMs || Date.now() - lastSeenMs > 60_000) {
        await supabase
          .from('committee_sessions')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('session_token_hash', tokenHash)
          .then(() => undefined, () => undefined);
      }
    }

    return {
      status: 'authenticated',
      user: {
        id: rawUser.id,
        email: rawUser.email,
        full_name: rawUser.full_name,
        role: rawUser.role as AuthRole,
      },
      expiresAt,
    };
  } catch (error) {
    return classifySessionError(error);
  }
}

export async function getSessionUserFromToken(token?: string | null): Promise<CommitteeSessionUser | null> {
  const resolution = await resolveSessionFromToken(token);
  return resolution.status === 'authenticated' ? resolution.user : null;
}

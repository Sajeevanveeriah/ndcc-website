import crypto from 'crypto';
import { createServerClient } from '@/lib/supabase-server';
import { AUTH_COOKIE_NAME, AUTH_COOKIE_DOMAIN, AuthRole, SESSION_TTL_DAYS } from './config';

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
    const { data, error } = await supabase
      .from('committee_sessions')
      .select('expires_at, committee_users(id, email, full_name, role, is_active)')
      .eq('session_token_hash', tokenHash)
      .maybeSingle();

    if (error) return { status: 'unavailable', reason: 'database_error' };
    if (!data) return { status: 'unauthenticated', reason: 'session_not_found' };

    const expiresAt = new Date(data.expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
      return { status: 'unauthenticated', reason: 'expired' };
    }

    const rawUser = Array.isArray(data.committee_users) ? data.committee_users[0] : data.committee_users;

    if (!rawUser || !rawUser.is_active) return { status: 'unauthenticated', reason: 'inactive_user' };

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

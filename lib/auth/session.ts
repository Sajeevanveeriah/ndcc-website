import crypto from 'crypto';
import { createServerClient } from '@/lib/supabase-server';
import { AUTH_COOKIE_NAME, AuthRole, SESSION_TTL_DAYS } from './config';

export interface CommitteeSessionUser {
  id: string;
  email: string;
  full_name: string;
  role: AuthRole;
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
    expires: expiresAt,
  };
}

export async function getSessionUserFromToken(token?: string | null): Promise<CommitteeSessionUser | null> {
  if (!token) return null;

  const supabase = createServerClient();
  const tokenHash = hashSessionToken(token);

  const { data, error } = await supabase
    .from('committee_sessions')
    .select('expires_at, committee_users(id, email, full_name, role, is_active)')
    .eq('session_token_hash', tokenHash)
    .maybeSingle();

  if (error || !data) return null;

  const expiresAt = new Date(data.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
    await supabase.from('committee_sessions').delete().eq('session_token_hash', tokenHash);
    return null;
  }

  const rawUser = Array.isArray(data.committee_users) ? data.committee_users[0] : data.committee_users;

  if (!rawUser || !rawUser.is_active) return null;

  return {
    id: rawUser.id,
    email: rawUser.email,
    full_name: rawUser.full_name,
    role: rawUser.role as AuthRole,
  };
}

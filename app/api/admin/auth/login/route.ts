import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { createAuthCookie, generateSessionToken, hashSessionToken, sessionExpiryDate } from '@/lib/auth/session';
import { enforceRateLimit, getClientIp } from '@/lib/server/request-guards';

export const dynamic = 'force-dynamic';

const AUTH_SUPABASE_TIMEOUT_MS = 12_000;
const UNAVAILABLE_MESSAGE = 'Admin login service is temporarily unavailable';

function jsonNoStore(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' },
  });
}

function isUnavailableError(error: unknown) {
  if (!error) return false;
  const value = error as { name?: string; message?: string; status?: number; code?: string };
  const message = String(value.message || '').toLowerCase();
  const status = Number(value.status || 0);
  return (
    value.name === 'AbortError' ||
    value.code === 'AbortError' ||
    message.includes('abort') ||
    message.includes('timeout') ||
    message.includes('fetch') ||
    message.includes('network') ||
    status >= 500
  );
}

async function withAuthRetry<T>(operation: () => PromiseLike<T>) {
  try {
    return await operation();
  } catch (error) {
    if (!isUnavailableError(error)) throw error;
    return operation();
  }
}

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    const ip = getClientIp(request);
    const emailKey = String(email || '').trim().toLowerCase();

    if (!enforceRateLimit(`admin-login-ip:${ip}`, 8, 60_000) || !enforceRateLimit(`admin-login-email:${emailKey}`, 6, 60_000)) {
      return jsonNoStore({ success: false, error: 'Too many login attempts. Please wait and try again.' }, 429);
    }

    if (!email || !password) {
      return jsonNoStore({ success: false, error: 'Email and password are required.' }, 400);
    }

    const supabase = createServerClient({ fetchTimeoutMs: AUTH_SUPABASE_TIMEOUT_MS });
    const { data: user, error } = await withAuthRetry(() => supabase.rpc('ndcc_verify_committee_user', {
      p_email: emailKey,
      p_password: String(password),
    }).maybeSingle<{ id: string; email: string; full_name: string; role: string }>());

    if (error) {
      console.error('Admin login verification unavailable', { code: error.code });
      return jsonNoStore({ success: false, error: UNAVAILABLE_MESSAGE }, 503);
    }

    if (!user) {
      return jsonNoStore({ success: false, error: 'Invalid email or password.' }, 401);
    }

    const sessionToken = generateSessionToken();
    const tokenHash = hashSessionToken(sessionToken);
    const expiresAt = sessionExpiryDate();

    const { error: sessionError } = await withAuthRetry(() => supabase.from('committee_sessions').insert({
      user_id: user.id,
      session_token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
    }));

    if (sessionError) {
      console.error('Admin login session insert unavailable', { code: sessionError.code });
      return jsonNoStore({ success: false, error: UNAVAILABLE_MESSAGE }, 503);
    }

    const response = jsonNoStore({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
      },
    });

    response.cookies.set(createAuthCookie(sessionToken, expiresAt));
    return response;
  } catch (error) {
    console.error('Login route error', error);
    return jsonNoStore({ success: false, error: UNAVAILABLE_MESSAGE }, 503);
  }
}

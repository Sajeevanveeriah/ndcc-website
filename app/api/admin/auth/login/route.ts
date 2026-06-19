import { NextResponse } from 'next/server';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';
import { withSupabaseOperationRetry } from '@/lib/supabase-operation';
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

function requestId() {
  return crypto.randomUUID();
}

function logAuthStage(stage: string, details: Record<string, unknown>) {
  console.info('Admin login stage', { stage, ...details });
}

export async function POST(request: Request) {
  const id = requestId();
  try {
    let body: { email?: unknown; password?: unknown };
    try {
      body = await request.json();
    } catch {
      logAuthStage('request validation', { requestId: id, httpStatus: 400 });
      return jsonNoStore({ success: false, error: 'Malformed login request.' }, 400);
    }

    const { email, password } = body;
    const ip = getClientIp(request);
    const emailKey = String(email || '').trim().toLowerCase();

    if (!enforceRateLimit(`admin-login-ip:${ip}`, 8, 60_000) || !enforceRateLimit(`admin-login-email:${emailKey}`, 6, 60_000)) {
      logAuthStage('request validation', { requestId: id, httpStatus: 429 });
      return jsonNoStore({ success: false, error: 'Too many login attempts. Please wait and try again.' }, 429);
    }

    if (!email || !password) {
      logAuthStage('request validation', { requestId: id, httpStatus: 400 });
      return jsonNoStore({ success: false, error: 'Email and password are required.' }, 400);
    }

    if (!isServerSupabaseConfigured()) {
      logAuthStage('Supabase configuration readiness', { requestId: id, httpStatus: 503 });
      return jsonNoStore({ success: false, error: UNAVAILABLE_MESSAGE }, 503);
    }

    logAuthStage('request validation', { requestId: id, httpStatus: 200 });
    logAuthStage('Supabase configuration readiness', { requestId: id, httpStatus: 200 });

    const supabase = createServerClient({ fetchTimeoutMs: AUTH_SUPABASE_TIMEOUT_MS });
    const { data: user, error, status, operationMeta } = await withSupabaseOperationRetry(() => supabase.rpc('ndcc_verify_committee_user', {
      p_email: emailKey,
      p_password: String(password),
    }).maybeSingle<{ id: string; email: string; full_name: string; role: string }>(),
      (retry) => logAuthStage('credential RPC retry', { requestId: id, retryCount: retry.attempt, httpStatus: retry.status, supabaseCode: retry.code }),
    );

    if (error) {
      logAuthStage('credential RPC', { requestId: id, httpStatus: 503, supabaseCode: error.code, retryCount: operationMeta.attempts - 1, supabaseStatus: status });
      return jsonNoStore({ success: false, error: UNAVAILABLE_MESSAGE }, 503);
    }

    if (!user) {
      logAuthStage('credential RPC', { requestId: id, httpStatus: 401, retryCount: operationMeta.attempts - 1 });
      return jsonNoStore({ success: false, error: 'Invalid email or password.' }, 401);
    }

    const sessionToken = generateSessionToken();
    const tokenHash = hashSessionToken(sessionToken);
    const expiresAt = sessionExpiryDate();

    logAuthStage('credential RPC', { requestId: id, httpStatus: 200, retryCount: operationMeta.attempts - 1 });

    const { error: sessionError, status: sessionStatus, operationMeta: sessionMeta } = await withSupabaseOperationRetry(() => supabase.from('committee_sessions').insert({
      user_id: user.id,
      session_token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
    }),
      (retry) => logAuthStage('session insert retry', { requestId: id, retryCount: retry.attempt, httpStatus: retry.status, supabaseCode: retry.code }),
    );

    if (sessionError) {
      logAuthStage('session insert', { requestId: id, httpStatus: 503, supabaseCode: sessionError.code, retryCount: sessionMeta.attempts - 1, supabaseStatus: sessionStatus });
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

    logAuthStage('session insert', { requestId: id, httpStatus: 200, retryCount: sessionMeta.attempts - 1 });
    response.cookies.set(createAuthCookie(sessionToken, expiresAt));
    logAuthStage('cookie creation', { requestId: id, httpStatus: 200 });
    return response;
  } catch (error) {
    console.error('Login route error', { requestId: id, name: error instanceof Error ? error.name : 'unknown' });
    return jsonNoStore({ success: false, error: UNAVAILABLE_MESSAGE }, 503);
  }
}

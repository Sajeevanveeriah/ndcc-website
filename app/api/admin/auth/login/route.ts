import { NextResponse } from 'next/server';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';
import { withSupabaseOperationRetry } from '@/lib/supabase-operation';
import { createAuthCookie, generateSessionToken, hashSessionToken, sessionExpiryDate } from '@/lib/auth/session';
import { enforceRateLimit, getClientIp } from '@/lib/server/request-guards';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

const CREDENTIAL_RPC_TIMEOUT_MS = 4_500;
const SESSION_INSERT_TIMEOUT_MS = 4_500;
const UNAVAILABLE_MESSAGE = 'Admin login service is temporarily unavailable';
type LoginUnavailableStage = 'supabase_config' | 'credential_rpc' | 'session_insert' | 'unexpected';
type LoginDiagnosticCode = 'SUPABASE_SERVER_CONFIG_MISSING' | 'CREDENTIAL_RPC_FAILED' | 'SESSION_INSERT_FAILED' | 'UNEXPECTED_LOGIN_ERROR';
const OPERATION_TIMEOUT_ERROR = { code: 'AbortError', message: 'Supabase operation timed out' };

function jsonNoStore(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' },
  });
}

function unavailableJson(requestId: string, stage: LoginUnavailableStage, diagnosticCode: LoginDiagnosticCode) {
  return jsonNoStore({ success: false, error: UNAVAILABLE_MESSAGE, requestId, stage, diagnosticCode }, 503);
}

function requestId() {
  return crypto.randomUUID();
}

function elapsedMs(startedAt: number) {
  return Math.round(performance.now() - startedAt);
}

function logAuthStage(stage: string, details: Record<string, unknown>) {
  console.info('Admin login stage', { stage, ...details });
}

function timeoutResult<TData>(timeoutMs: number) {
  return new Promise<{ data: TData | null; error: typeof OPERATION_TIMEOUT_ERROR; status: number }>((resolve) => {
    setTimeout(() => resolve({ data: null, error: OPERATION_TIMEOUT_ERROR, status: 504 }), timeoutMs);
  });
}

function withOperationTimeout<TData, TResult extends { data: TData | null; error: unknown; status?: number }>(
  operation: PromiseLike<TResult>,
  timeoutMs: number,
) {
  return Promise.race([operation, timeoutResult<TData>(timeoutMs)]);
}

export async function POST(request: Request) {
  const id = requestId();
  const startedAt = performance.now();

  try {
    let body: { email?: unknown; password?: unknown };
    try {
      body = await request.json();
    } catch {
      logAuthStage('request validation', { requestId: id, httpStatus: 400, elapsedMs: elapsedMs(startedAt) });
      return jsonNoStore({ success: false, error: 'Malformed login request.', requestId: id }, 400);
    }

    const { email, password } = body;
    const ip = getClientIp(request);
    const emailKey = String(email || '').trim().toLowerCase();

    if (!enforceRateLimit(`admin-login-ip:${ip}`, 8, 60_000) || !enforceRateLimit(`admin-login-email:${emailKey}`, 6, 60_000)) {
      logAuthStage('request validation', { requestId: id, httpStatus: 429, elapsedMs: elapsedMs(startedAt) });
      return jsonNoStore({ success: false, error: 'Too many login attempts. Please wait and try again.', requestId: id }, 429);
    }

    if (!email || !password) {
      logAuthStage('request validation', { requestId: id, httpStatus: 400, elapsedMs: elapsedMs(startedAt) });
      return jsonNoStore({ success: false, error: 'Email and password are required.', requestId: id }, 400);
    }

    if (!isServerSupabaseConfigured()) {
      logAuthStage('Supabase configuration readiness', { requestId: id, httpStatus: 503, elapsedMs: elapsedMs(startedAt) });
      return unavailableJson(id, 'supabase_config', 'SUPABASE_SERVER_CONFIG_MISSING');
    }

    logAuthStage('request validation', { requestId: id, httpStatus: 200, elapsedMs: elapsedMs(startedAt) });
    logAuthStage('Supabase configuration readiness', { requestId: id, httpStatus: 200, elapsedMs: elapsedMs(startedAt) });

    const credentialClient = createServerClient({ fetchTimeoutMs: CREDENTIAL_RPC_TIMEOUT_MS });
    const { data: user, error, status, operationMeta } = await withSupabaseOperationRetry(() => withOperationTimeout(
      credentialClient.rpc('ndcc_verify_committee_user', {
        p_email: emailKey,
        p_password: String(password),
      }).maybeSingle<{ id: string; email: string; full_name: string; role: string }>(),
      CREDENTIAL_RPC_TIMEOUT_MS,
    ),
      (retry) => logAuthStage('credential RPC retry', { requestId: id, retryCount: retry.attempt, httpStatus: retry.status, supabaseCode: retry.code, elapsedMs: elapsedMs(startedAt) }),
    );

    if (error) {
      logAuthStage('credential RPC', { requestId: id, httpStatus: 503, supabaseCode: error.code, retryCount: operationMeta.attempts - 1, supabaseStatus: status, elapsedMs: elapsedMs(startedAt) });
      return unavailableJson(id, 'credential_rpc', 'CREDENTIAL_RPC_FAILED');
    }

    if (!user) {
      logAuthStage('credential RPC', { requestId: id, httpStatus: 401, retryCount: operationMeta.attempts - 1, elapsedMs: elapsedMs(startedAt) });
      return jsonNoStore({ success: false, error: 'Invalid email or password.', requestId: id }, 401);
    }

    const sessionToken = generateSessionToken();
    const tokenHash = hashSessionToken(sessionToken);
    const expiresAt = sessionExpiryDate();

    logAuthStage('credential RPC', { requestId: id, httpStatus: 200, retryCount: operationMeta.attempts - 1, elapsedMs: elapsedMs(startedAt) });

    const sessionClient = createServerClient({ fetchTimeoutMs: SESSION_INSERT_TIMEOUT_MS });
    const { error: sessionError, status: sessionStatus, operationMeta: sessionMeta } = await withSupabaseOperationRetry(() => withOperationTimeout(
      sessionClient.from('committee_sessions').insert({
        user_id: user.id,
        session_token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
      }),
      SESSION_INSERT_TIMEOUT_MS,
    ),
      (retry) => logAuthStage('session insert retry', { requestId: id, retryCount: retry.attempt, httpStatus: retry.status, supabaseCode: retry.code, elapsedMs: elapsedMs(startedAt) }),
    );

    if (sessionError) {
      logAuthStage('session insert', { requestId: id, httpStatus: 503, supabaseCode: sessionError.code, retryCount: sessionMeta.attempts - 1, supabaseStatus: sessionStatus, elapsedMs: elapsedMs(startedAt) });
      return unavailableJson(id, 'session_insert', 'SESSION_INSERT_FAILED');
    }

    const response = jsonNoStore({
      success: true,
      requestId: id,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
      },
    });

    logAuthStage('session insert', { requestId: id, httpStatus: 200, retryCount: sessionMeta.attempts - 1, elapsedMs: elapsedMs(startedAt) });
    response.cookies.set(createAuthCookie(sessionToken, expiresAt));
    logAuthStage('cookie creation', { requestId: id, httpStatus: 200, elapsedMs: elapsedMs(startedAt) });
    return response;
  } catch (error) {
    console.error('Login route error', { requestId: id, name: error instanceof Error ? error.name : 'unknown', elapsedMs: elapsedMs(startedAt) });
    return unavailableJson(id, 'unexpected', 'UNEXPECTED_LOGIN_ERROR');
  }
}

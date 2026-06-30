import { NextResponse } from 'next/server';
import { createServerClient, getSupabaseServerReadiness } from '@/lib/supabase-server';
import { generateSessionToken, hashSessionToken, sessionExpiryDate } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

const READINESS_TIMEOUT_MS = 4_500;
const DIAGNOSTIC_EMAIL = 'diagnostic.invalid@example.invalid';

function hidden() {
  return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'no-store', Vary: 'x-diagnostic-token' } });
}

function jsonNoStore(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'x-diagnostic-token' } });
}

function safeError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message.slice(0, 160) };
  return { name: 'UnknownError', message: 'Unknown readiness error' };
}

export async function GET(request: Request) {
  if (process.env.ADMIN_AUTH_READINESS_ENABLED !== 'true') return hidden();

  const expectedToken = process.env.ADMIN_DIAGNOSTIC_TOKEN;
  const suppliedToken = request.headers.get('x-diagnostic-token');
  if (!expectedToken || suppliedToken !== expectedToken) return hidden();

  const readiness = getSupabaseServerReadiness();
  const result: Record<string, unknown> = {
    ...readiness,
    canCallCredentialRpcWithInvalidCredentials: false,
    invalidCredentialRpcReturnedNoUser: false,
    canInsertAndDeleteSyntheticSession: false,
    timestamp: new Date().toISOString(),
  };

  if (!readiness.canCreateServerClient) {
    return jsonNoStore(result);
  }

  try {
    const supabase = createServerClient({ fetchTimeoutMs: READINESS_TIMEOUT_MS });
    result.canCreateServerClient = true;

    const { data, error } = await supabase.rpc('ndcc_verify_committee_user', {
      p_email: DIAGNOSTIC_EMAIL,
      p_password: 'diagnostic-invalid-password',
    }).maybeSingle<{ id: string }>();
    result.canCallCredentialRpcWithInvalidCredentials = !error;
    result.invalidCredentialRpcReturnedNoUser = !error && !data;
    if (error) result.credentialRpcError = { code: error.code, message: error.message.slice(0, 160) };

    if (process.env.DIAGNOSTIC_MUTATION_ENABLED === 'true') {
      const { data: user, error: userError } = await supabase
        .from('committee_users')
        .select('id')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle<{ id: string }>();

      if (userError) {
        result.syntheticSessionError = { code: userError.code, message: userError.message.slice(0, 160) };
      } else if (user?.id) {
        const tokenHash = hashSessionToken(generateSessionToken());
        const expiresAt = sessionExpiryDate();
        const { data: inserted, error: insertError } = await supabase
          .from('committee_sessions')
          .insert({ user_id: user.id, session_token_hash: tokenHash, expires_at: expiresAt.toISOString() })
          .select('id')
          .single<{ id: string }>();

        if (insertError) {
          result.syntheticSessionError = { code: insertError.code, message: insertError.message.slice(0, 160) };
        } else {
          const { error: deleteError } = await supabase.from('committee_sessions').delete().eq('id', inserted.id);
          result.canInsertAndDeleteSyntheticSession = !deleteError;
          if (deleteError) result.syntheticSessionError = { code: deleteError.code, message: deleteError.message.slice(0, 160) };
        }
      }
    }
  } catch (error) {
    result.readinessError = safeError(error);
  }

  return jsonNoStore(result);
}

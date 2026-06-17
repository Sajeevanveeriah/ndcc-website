import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { createAuthCookie, generateSessionToken, hashSessionToken, sessionExpiryDate } from '@/lib/auth/session';
import { enforceRateLimit, getClientIp } from '@/lib/server/request-guards';

export const dynamic = 'force-dynamic';
export const preferredRegion = 'syd1';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    const ip = getClientIp(request);
    const emailKey = String(email || '').trim().toLowerCase();

    if (!enforceRateLimit(`admin-login-ip:${ip}`, 8, 60_000) || !enforceRateLimit(`admin-login-email:${emailKey}`, 6, 60_000)) {
      return NextResponse.json({ success: false, error: 'Too many login attempts. Please wait and try again.' }, { status: 429 });
    }

    if (!email || !password) {
      return NextResponse.json({ success: false, error: 'Email and password are required.' }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data: user, error } = await supabase.rpc('ndcc_verify_committee_user', {
      p_email: String(email).trim().toLowerCase(),
      p_password: String(password),
    }).maybeSingle<{ id: string; email: string; full_name: string; role: string }>();

    if (error) {
      console.error('Admin login RPC failed', { code: error.code, message: error.message, email: emailKey });
      return NextResponse.json({ success: false, error: 'Invalid email or password.' }, { status: 401 });
    }

    if (!user) {
      const { data: existingUser, error: lookupError } = await supabase
        .from('committee_users')
        .select('id,is_active,role')
        .eq('email', emailKey)
        .maybeSingle();
      console.warn('Admin login rejected', {
        email: emailKey,
        userExists: Boolean(existingUser),
        isActive: existingUser?.is_active ?? null,
        role: existingUser?.role ?? null,
        lookupError: lookupError ? { code: lookupError.code, message: lookupError.message } : null,
      });
      return NextResponse.json({ success: false, error: 'Invalid email or password.' }, { status: 401 });
    }

    const sessionToken = generateSessionToken();
    const tokenHash = hashSessionToken(sessionToken);
    const expiresAt = sessionExpiryDate();

    const { error: sessionError } = await supabase.from('committee_sessions').insert({
      user_id: user.id,
      session_token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
    });

    if (sessionError) {
      console.error('Failed to create session', sessionError);
      return NextResponse.json({ success: false, error: 'Login failed.' }, { status: 500 });
    }

    const response = NextResponse.json({
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
    return NextResponse.json({ success: false, error: 'Unexpected server error.' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME } from '@/lib/auth/config';
import { createServerClient } from '@/lib/supabase-server';
import { hashSessionToken, clearAuthCookie } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function POST() {
  const cookieStore = cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (token) {
    try {
      const supabase = createServerClient();
      const { error } = await supabase.from('committee_sessions').delete().eq('session_token_hash', hashSessionToken(token));
      if (error) {
        return NextResponse.json(
          { success: false, error: 'Logout service is temporarily unavailable.' },
          { status: 503, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } },
        );
      }
    } catch {
      return NextResponse.json(
        { success: false, error: 'Logout service is temporarily unavailable.' },
        { status: 503, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } },
      );
    }
  }

  const response = NextResponse.json(
    { success: true },
    { headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } },
  );
  response.cookies.set(clearAuthCookie());
  return response;
}

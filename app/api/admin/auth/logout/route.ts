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
    const supabase = createServerClient();
    await supabase.from('committee_sessions').delete().eq('session_token_hash', hashSessionToken(token));
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(clearAuthCookie());
  return response;
}

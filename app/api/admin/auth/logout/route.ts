import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME } from '@/lib/auth/config';
import { createServerClient } from '@/lib/supabase-server';
import { hashSessionToken } from '@/lib/auth/session';

export async function POST() {
  const cookieStore = cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (token) {
    const supabase = createServerClient();
    await supabase.from('committee_sessions').delete().eq('session_token_hash', hashSessionToken(token));
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set({ name: AUTH_COOKIE_NAME, value: '', path: '/', maxAge: 0 });
  return response;
}

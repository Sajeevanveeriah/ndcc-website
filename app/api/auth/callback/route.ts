import { createServerClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.warn('Supabase not configured - redirecting to admin');
      return NextResponse.redirect(`${origin}/admin`);
    }

    const supabase = createServerClient();

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('Auth callback error:', error);
      return NextResponse.redirect(`${origin}/admin?error=auth_failed`);
    }
  }

  return NextResponse.redirect(`${origin}/admin`);
}

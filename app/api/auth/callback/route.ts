import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/admin/login?notice=legacy_supabase_auth_deprecated`);
}

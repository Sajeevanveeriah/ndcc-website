import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME } from '@/lib/auth/config';
import { getSessionUserFromToken } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  const user = await getSessionUserFromToken(token);

  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json({ authenticated: true, user }, { headers: { 'Cache-Control': 'no-store' } });
}

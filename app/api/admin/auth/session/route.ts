import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME } from '@/lib/auth/config';
import { resolveSessionFromToken } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  const session = await resolveSessionFromToken(token);

  if (session.status === 'authenticated') {
    return NextResponse.json(
      { authenticated: true, user: session.user, expiresAt: session.expiresAt.toISOString() },
      { headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } },
    );
  }

  if (session.status === 'unavailable') {
    return NextResponse.json(
      { authenticated: null, unavailable: true, reason: session.reason, error: 'Session validation is temporarily unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } },
    );
  }

  return NextResponse.json(
    { authenticated: false, reason: session.reason },
    { status: 401, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } },
  );
}

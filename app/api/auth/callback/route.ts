import { NextResponse } from 'next/server';
import { resolveAuthCallbackRedirect } from '@/lib/auth/callback-redirect';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const response = NextResponse.redirect(resolveAuthCallbackRedirect(url));
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

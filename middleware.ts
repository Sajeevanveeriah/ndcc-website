import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/auth/config';

// Server-side guard for /admin pages: visitors without a session cookie never
// receive the admin page shell. Full token validation (expiry, idle window,
// user active) still happens in every /api/admin route and in the client-side
// session check — this only screens the obviously-unauthenticated case at the
// edge, where database lookups are not possible.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === '/admin/login') return NextResponse.next();

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/admin'],
};

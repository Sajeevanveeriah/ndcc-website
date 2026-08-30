import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/auth/config';
import { ADMIN_CSRF_HEADER, validateAdminCsrfRequest } from '@/lib/auth/csrf';

// Server-side guard for /admin pages: visitors without a session cookie never
// receive the admin page shell. Full token validation (expiry, idle window,
// user active) still happens in every /api/admin route and in the client-side
// session check — this only screens the obviously-unauthenticated case at the
// edge, where database lookups are not possible.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  const isCookieProtectedApi = pathname.startsWith('/api/admin/')
    || pathname === '/api/meeting-minutes'
    || pathname.startsWith('/api/meeting-minutes/');
  if (isCookieProtectedApi) {
    const csrfResult = validateAdminCsrfRequest({
      method: request.method,
      pathname,
      hasSessionCookie: Boolean(token),
      origin: request.headers.get('origin'),
      secFetchSite: request.headers.get('sec-fetch-site'),
      contentType: request.headers.get('content-type'),
      csrfHeader: request.headers.get(ADMIN_CSRF_HEADER),
    });
    if (!csrfResult.ok) {
      return NextResponse.json(
        { success: false, error: 'Invalid request origin.' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    // Authentication and role checks remain in the route handlers. This keeps
    // bearer/public flows cookie-independent and avoids API-to-page redirects.
    return NextResponse.next();
  }

  if (pathname === '/admin/login') return NextResponse.next();

  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/admin',
    '/api/admin/:path*',
    '/api/meeting-minutes',
    '/api/meeting-minutes/:path*',
  ],
};

export const AUTH_COOKIE_NAME = 'ndcc_committee_session';
export const SESSION_TTL_DAYS = 14;
// Server-side inactivity window. The admin UI warns at 9 minutes and signs out at
// 10; the server allows a small grace on top so an in-flight request near the
// boundary isn't rejected, while a bypassed client timer still cannot keep an
// idle session alive.
export const SESSION_IDLE_TIMEOUT_MINUTES = 15;
function sanitizeCookieDomain(raw?: string): string | undefined {
  const value = (raw || '').trim();
  if (!value) return undefined;
  // Cookie Domain must be a bare host (optional leading dot). Reject scheme,
  // path, port, spaces or '@' so a misconfigured value (e.g. a full URL)
  // cannot make the browser silently drop the session cookie.
  const host = value.replace(/^\./, '');
  if (/[\s/@:]/.test(host) || !host.includes('.') || host === 'localhost') {
    if (process.env.NODE_ENV === 'production') {
      console.warn(`[auth] Ignoring invalid AUTH_COOKIE_DOMAIN "${value}". Use a bare domain like .ndcc.com.au`);
    }
    return undefined;
  }
  return value;
}

export const AUTH_COOKIE_DOMAIN = sanitizeCookieDomain(process.env.AUTH_COOKIE_DOMAIN);

export const AUTH_ROLES = ['admin', 'president', 'secretary', 'committee', 'fantasy_manager'] as const;
export type AuthRole = (typeof AUTH_ROLES)[number];

// Club content and season operations exclude the Fantasy-only manager role.
export const CLUB_ADMIN_ROLES: AuthRole[] = ['admin', 'president', 'secretary', 'committee'];

// Roles allowed to manage Fantasy CMS modules (seasons, players, prices,
// rounds, imports, scoring, rollover). fantasy_manager is restricted to these
// modules only — every other admin route keeps its original role list.
export const FANTASY_ADMIN_ROLES: AuthRole[] = ['admin', 'president', 'secretary', 'committee', 'fantasy_manager'];

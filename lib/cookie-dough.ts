// 30 September 2026, 9 pm Australia/Melbourne (AEST, UTC+10).
export const COOKIE_DOUGH_ENDS_AT = Date.parse('2026-09-30T21:00:00+10:00');
export const COOKIE_DOUGH_DEADLINE_LABEL = 'Ends 30 September 2026 at 9 pm (Melbourne time).';
export function isCookieDoughOpen(now = Date.now()): boolean {
  return now < COOKIE_DOUGH_ENDS_AT;
}
export function isCookieDoughLink(href: string): boolean {
  try {
    const url = new URL(href, 'https://www.ndcc.com.au');
    return ['www.ndcc.com.au', 'ndcc.com.au'].includes(url.hostname)
      && url.pathname.replace(/\/$/, '') === '/fundraising/cookie-dough';
  } catch { return false; }
}

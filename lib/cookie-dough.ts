// 30 September 2026, 9 pm Australia/Melbourne (AEST, UTC+10).
// Hardcoded fallback; the CMS promotion 'cookie-dough' (/admin/promotions)
// overrides it on the fundraiser page via getCookieDoughCampaign().
export const COOKIE_DOUGH_ENDS_AT = Date.parse('2026-09-30T21:00:00+10:00');
export const COOKIE_DOUGH_DEADLINE_LABEL = 'Ends 30 September 2026 at 9 pm (Melbourne time).';
/** `endsAt` null means open-ended; omitted means the hardcoded deadline. */
export function isCookieDoughOpen(now = Date.now(), endsAt: number | null = COOKIE_DOUGH_ENDS_AT): boolean {
  return endsAt === null || now < endsAt;
}
export function isCookieDoughLink(href: string): boolean {
  try {
    const url = new URL(href, 'https://www.ndcc.com.au');
    return ['www.ndcc.com.au', 'ndcc.com.au'].includes(url.hostname)
      && url.pathname.replace(/\/$/, '') === '/fundraising/cookie-dough';
  } catch { return false; }
}

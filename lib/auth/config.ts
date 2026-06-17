export const AUTH_COOKIE_NAME = 'ndcc_committee_session';
export const SESSION_TTL_DAYS = 14;
// Default to host-only cookies so www.ndcc.com.au and localhost keep isolated sessions.
// Set AUTH_COOKIE_DOMAIN=.ndcc.com.au in production only if the app must accept
// committee logins on both apex ndcc.com.au and www.ndcc.com.au simultaneously.
export const AUTH_COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN || undefined;

export const AUTH_ROLES = ['admin', 'president', 'secretary', 'committee'] as const;
export type AuthRole = (typeof AUTH_ROLES)[number];

export const AUTH_COOKIE_NAME = 'ndcc_committee_session';
export const SESSION_TTL_DAYS = 14;

export const AUTH_ROLES = ['admin', 'president', 'secretary', 'committee'] as const;
export type AuthRole = (typeof AUTH_ROLES)[number];

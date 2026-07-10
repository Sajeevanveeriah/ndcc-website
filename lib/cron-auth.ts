// Shared cron authorization rule (unit-tested in scripts/test-fantasy-seasons.mjs).
// Requires a configured secret of sane length and an exact Bearer match.
export function isAuthorizedCronRequest(authorizationHeader: string | null, cronSecret: string | undefined): boolean {
  if (!cronSecret || cronSecret.length < 16) return false;
  return authorizationHeader === `Bearer ${cronSecret}`;
}

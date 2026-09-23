import { createHash, timingSafeEqual } from 'node:crypto';

// Shared cron authorization rule (unit-tested in scripts/test-fantasy-seasons.mjs).
// Requires a configured secret of sane length and an exact Bearer match.
export function isAuthorizedCronRequest(authorizationHeader: string | null, cronSecret: string | undefined): boolean {
  if (!cronSecret || cronSecret.length < 16) return false;
  if (typeof authorizationHeader !== 'string') return false;
  return constantTimeEqual(authorizationHeader, `Bearer ${cronSecret}`);
}

// Length-safe constant-time string comparison. Both inputs are hashed to a
// fixed-length digest first so timingSafeEqual never throws on a length
// mismatch and the comparison time does not depend on where the inputs differ.
export function constantTimeEqual(supplied: string, expected: string): boolean {
  const a = createHash('sha256').update(supplied, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b) && supplied.length === expected.length;
}

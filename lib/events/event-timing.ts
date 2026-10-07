const CLUB_TIME_ZONE = 'Australia/Melbourne';
const clubDay = new Intl.DateTimeFormat('en-CA', { timeZone: CLUB_TIME_ZONE });

export type EventTiming = 'open' | 'started' | 'passed';

/**
 * Where an event sits relative to `now`, using the same rules as the rest of
 * the site:
 * - 'passed': its club-time day is before today (the /events "Past events"
 *   rule in app/events/(list)/page.tsx).
 * - 'started': it has started (or has no valid start), which is when
 *   POST /api/events stops taking registrations (eventHasStarted in
 *   app/api/events/route.ts).
 * - 'open': otherwise.
 */
export function eventTiming(date: unknown, now: number = Date.now()): EventTiming {
  const startsAt = typeof date === 'string' ? Date.parse(date) : Number.NaN;
  if (!Number.isFinite(startsAt)) return 'started';
  if (clubDay.format(new Date(startsAt)) < clubDay.format(new Date(now))) return 'passed';
  return startsAt <= now ? 'started' : 'open';
}

// setTimeout fires immediately for delays above 2^31 - 1 ms (about 24.8 days).
const MAX_TIMER_MS = 2 ** 31 - 1;

/**
 * Milliseconds until the event starts, for re-checking an open page at the
 * moment registration closes; null when it has already started, has no valid
 * start, or is too far away for a browser timer.
 */
export function msUntilEventStart(date: unknown, now: number = Date.now()): number | null {
  const startsAt = typeof date === 'string' ? Date.parse(date) : Number.NaN;
  if (!Number.isFinite(startsAt)) return null;
  const delay = startsAt - now;
  return delay > 0 && delay <= MAX_TIMER_MS ? delay : null;
}

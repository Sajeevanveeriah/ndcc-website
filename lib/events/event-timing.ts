const CLUB_TIME_ZONE = 'Australia/Melbourne';
const clubDay = new Intl.DateTimeFormat('en-CA', { timeZone: CLUB_TIME_ZONE });

export type EventTiming = 'open' | 'started' | 'passed';

/**
 * Where an event sits relative to `now`, using the same rules as the rest of
 * the site:
 * - 'passed': its club-time day is before today (the /events "Past events"
 *   rule in app/events/page.tsx).
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

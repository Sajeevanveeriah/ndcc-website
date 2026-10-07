// Pure helpers for the /fixtures match-day lists (no I/O). Unit tested in
// scripts/test-fixtures-layout.mjs.
import { isClubTeamName } from './season-match';
import { fixtureDayKey, formatFixtureDay, formatFixtureStartTime, opponentFor } from './team-view';
import type { PlayHQFixture, PlayHQTeam } from './types';

/** Match days shown open by default; later days sit behind "Show more". */
export const DEFAULT_EXPANDED_GROUPS = 3;

export type FixtureDayGroup<T extends Pick<PlayHQFixture, 'startsAt'> = PlayHQFixture> = {
  /** Melbourne YYYY-MM-DD, or "tbc" for undated games. */
  key: string;
  /** "Sat 10 Oct 2026", or "Date to be confirmed". */
  day: string;
  /** Machine-readable date for <time>, null when undated. */
  dateTime: string | null;
  fixtures: T[];
  /** True when no game in the group has a start time, so "Start time TBC" is said once for the day. */
  timeTbc: boolean;
};

/**
 * One group per Melbourne match day, in the order the fixtures are given
 * (upcoming soonest first, results latest first). Undated games share one
 * "Date to be confirmed" group.
 */
export function groupFixturesByDay<T extends Pick<PlayHQFixture, 'startsAt'>>(fixtures: readonly T[]): FixtureDayGroup<T>[] {
  const groups: FixtureDayGroup<T>[] = [];
  const byKey = new Map<string, FixtureDayGroup<T>>();
  for (const fixture of fixtures) {
    const dayKey = fixtureDayKey(fixture.startsAt);
    const key = dayKey || 'tbc';
    let group = byKey.get(key);
    if (!group) {
      group = { key, day: formatFixtureDay(fixture.startsAt), dateTime: dayKey, fixtures: [], timeTbc: true };
      byKey.set(key, group);
      groups.push(group);
    }
    group.fixtures.push(fixture);
    if (formatFixtureStartTime(fixture.startsAt)) group.timeTbc = false;
  }
  return groups;
}

/** The first `expanded` groups (at least one) and the rest. */
export function limitFixtureGroups<G>(groups: readonly G[], expanded = DEFAULT_EXPANDED_GROUPS): { shown: G[]; more: G[] } {
  const count = Math.max(1, Math.floor(Number.isFinite(expanded) ? expanded : DEFAULT_EXPANDED_GROUPS));
  return { shown: groups.slice(0, count), more: groups.slice(count) };
}

/**
 * Whether the NDCC side plays at home or away. With `team`, the same rule as
 * team pages (opponentFor). Without it, the side carrying the club name; a
 * game with NDCC on both sides, or on neither, has no badge.
 */
export function clubVenueRole(
  fixture: Pick<PlayHQFixture, 'homeTeam' | 'awayTeam'>,
  team?: Pick<PlayHQTeam, 'id' | 'name'> | null,
): 'Home' | 'Away' | null {
  if (team) return opponentFor(fixture as PlayHQFixture, team).venueRole;
  const home = isClubTeamName(fixture.homeTeam);
  const away = isClubTeamName(fixture.awayTeam);
  if (home === away) return null;
  return opponentFor(fixture as PlayHQFixture, { id: '', name: home ? fixture.homeTeam : fixture.awayTeam }).venueRole;
}

/** Per-row start time text: the time, or "Start time TBC" unless the group header already says so. */
export function fixtureTimeLabel(startsAt: string | null | undefined, groupTimeTbc = false): string | null {
  const time = formatFixtureStartTime(startsAt);
  if (time) return time;
  return groupTimeTbc ? null : 'Start time TBC';
}

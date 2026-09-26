// Home page match-day board and "This week" selection (components/home/match-day.ts).
// Recorded PlayHQ-shaped payloads go through the real normalisers first, so
// the board is tested against the same data shape the home page receives.
import assert from 'node:assert/strict';
import test from 'node:test';
import { normaliseFixtures, normaliseTeams } from '../lib/playhq/normalise.ts';
import {
  MATCH_DAY_WINDOW_MS,
  allWithinDays,
  comingUpDateParts,
  fixturesWithinDays,
  formatClubTime,
  formatMatchDayDate,
  isUpcomingFixture,
  melbourneDateKey,
  mergeComingUp,
  selectMatchDayBoard,
  unavailableGradesFromWarnings,
} from '../components/home/match-day.ts';

// Friday 2 October 2026, 9:00 am Melbourne (AEST, before the 4 Oct DST change).
const NOW = Date.parse('2026-10-01T23:00:00Z');

const gradeA = { id: 'grade-a', name: 'A Grade' };
const gradeB = { id: 'grade-b', name: 'B Grade' };
const gradeW = { id: 'grade-w', name: 'Women' };

const teams = normaliseTeams({ data: [
  { id: 'team-a', name: 'Newcomb & District 1st XI', grade: { id: 'grade-a', name: 'A Grade' } },
  { id: 'team-b', name: 'Newcomb & District 2nd XI', grade: { id: 'grade-b', name: 'B Grade' } },
  { id: 'team-w', name: 'Newcomb Women', grade: { id: 'grade-w', name: 'Women' } },
  { id: 'team-u', name: 'Newcomb Social XI' }, // ungraded: no grade from PlayHQ
  { id: 'team-a', name: 'Newcomb & District 1st XI', grade: { id: 'grade-a', name: 'A Grade' } }, // duplicate discovery
] });

const gradeAFixtures = normaliseFixtures({ data: { items: [
  // Last week's result: must be ignored.
  { id: 'a-r1', status: 'FINALIZED', competitors: [{ homeAway: 'HOME', team: { name: 'Newcomb & District 1st XI' } }, { homeAway: 'AWAY', team: { name: 'Leopold CC' } }], schedule: { date: '2026-09-26' }, homeScore: '8/201' },
  // Round 3 before round 2 in the payload: ordering must be by date.
  { id: 'a-r3', competitors: [{ homeAway: 'HOME', team: { name: 'Portarlington CC' } }, { homeAway: 'AWAY', team: { name: 'Newcomb & District 1st XI' } }], scheduledStartTime: '2026-10-10T02:30:00Z', venue: { name: 'Portarlington Recreation Reserve' }, url: 'https://www.playhq.com/cricket-australia/org/game/a-r3' },
  { id: 'a-r2', competitors: [{ homeAway: 'HOME', team: { name: 'Newcomb & District 1st XI' } }, { homeAway: 'AWAY', team: { name: 'Ocean Grove CC' } }], scheduledStartTime: '2026-10-03T02:30:00Z', venue: { name: 'Bellarine Community Oval' }, url: 'https://www.playhq.com/cricket-australia/org/game/a-r2' },
] } }, gradeA);

const gradeBFixtures = normaliseFixtures({ games: [
  // Started 2 hours ago: still today's match, stays on the board.
  { gameId: 'b-live', homeTeamName: 'Barwon Heads CC', awayTeamName: 'Newcomb & District 2nd XI', startTime: '2026-10-01T21:00:00Z', groundName: 'Barwon Heads Oval', publicUrl: 'javascript:alert(1)' },
  { gameId: 'b-next', homeTeamName: 'Newcomb & District 2nd XI', awayTeamName: 'Drysdale CC', startTime: '2026-10-08T23:00:00Z' },
] }, gradeB);

// Women: only a date-only fixture (no start time) in two weeks.
const gradeWFixtures = normaliseFixtures({ games: [
  { gameId: 'w-1', homeTeamName: 'Newcomb Women', awayTeamName: 'Geelong Women', date: '2026-10-16' },
] }, gradeW);

// A fixture in another grade that names the 1st XI must not be picked up
// through a name match, because the 1st XI is graded.
const strayFixture = normaliseFixtures({ games: [
  { gameId: 'stray', homeTeamName: 'Newcomb & District 1st XI', awayTeamName: 'Somebody', startTime: '2026-10-02T00:00:00Z' },
] }, gradeB);

const fixtures = [...gradeAFixtures, ...gradeBFixtures, ...gradeWFixtures, ...strayFixture];

test('selects the next fixture per team, in date order, from the team\'s own grade', () => {
  const board = selectMatchDayBoard(teams, fixtures, NOW);
  assert.deepEqual(board.map((entry) => entry.teamId), ['team-a', 'team-b', 'team-w', 'team-u'], 'deduplicated, graded teams first in grade order, ungraded last');

  const first = board[0];
  assert.equal(first.state, 'scheduled');
  assert.equal(first.fixture.id, 'a-r2', 'round 2 before round 3 despite payload order; last week\'s result ignored');
  assert.equal(first.fixture.homeAway, 'Home');
  assert.equal(first.fixture.opponent, 'Ocean Grove CC');
  assert.equal(first.fixture.venue, 'Bellarine Community Oval');
  assert.equal(first.fixture.playHQUrl, 'https://www.playhq.com/cricket-australia/org/game/a-r2');

  const second = board[1];
  assert.equal(second.fixture.id, 'b-live', 'a match in progress stays on the board');
  assert.equal(second.fixture.homeAway, 'Away');
  assert.equal(second.fixture.opponent, 'Barwon Heads CC');
  assert.equal(second.fixture.playHQUrl, null, 'non-https PlayHQ links are dropped');

  const women = board[2];
  assert.equal(women.fixture.id, 'w-1');
  assert.equal(women.fixture.dateOnly, true);
  assert.equal(formatMatchDayDate(women.fixture.startsAt), 'Fri 16 Oct, time TBC', 'date-only fixtures never invent a start time');
});

test('ungraded teams match by name; teams without a fixture are "not released"', () => {
  const board = selectMatchDayBoard(teams, fixtures, NOW);
  const social = board.find((entry) => entry.teamId === 'team-u');
  assert.equal(social.gradeName, null);
  assert.equal(social.state, 'not_released');
  assert.equal(social.fixture, null);

  const withSocialFixture = [...fixtures, ...normaliseFixtures({ games: [
    { gameId: 'soc-1', homeTeamName: 'Ocean Grove Social', awayTeamName: 'Newcomb Social XI', startTime: '2026-10-04T01:00:00Z' },
  ] }, { id: 'grade-social', name: 'Social' })];
  const found = selectMatchDayBoard(teams, withSocialFixture, NOW).find((entry) => entry.teamId === 'team-u');
  assert.equal(found.state, 'scheduled');
  assert.equal(found.fixture.id, 'soc-1');
  assert.equal(found.fixture.homeAway, 'Away');
});

test('a failed grade feed is "unavailable", never "not released"', () => {
  const warnings = ['Team discovery failed for a current-season competition: 500', 'Fixtures for Women: PlayHQ request failed (404)', 'Ladder for A Grade: 404'];
  const unavailable = unavailableGradesFromWarnings(warnings);
  assert.deepEqual([...unavailable], ['Women']);
  const board = selectMatchDayBoard(teams, [...gradeAFixtures, ...gradeBFixtures], NOW, unavailable);
  assert.equal(board.find((entry) => entry.teamId === 'team-w').state, 'unavailable');
  assert.equal(board.find((entry) => entry.teamId === 'team-u').state, 'not_released');
});

test('undated fixtures are a fallback only, and never when they already have a result', () => {
  const undated = normaliseFixtures({ games: [
    { gameId: 'tbc', homeTeamName: 'Newcomb Social XI', awayTeamName: 'Opponent' },
    { gameId: 'tbc-played', homeTeamName: 'Newcomb Social XI', awayTeamName: 'Old', homeScore: '100' },
  ] }, { id: 'x', name: 'X' });
  const entry = selectMatchDayBoard([teams[3]], undated, NOW)[0];
  assert.equal(entry.fixture.id, 'tbc');
  assert.equal(entry.fixture.startsAt, null);
  assert.equal(formatMatchDayDate(entry.fixture.startsAt), 'Date TBC');
  assert.equal(selectMatchDayBoard([teams[3]], [undated[1]], NOW)[0].state, 'not_released');
});

test('empty inputs produce an empty board (the page hides it)', () => {
  assert.deepEqual(selectMatchDayBoard([], fixtures, NOW), []);
  assert.equal(selectMatchDayBoard(teams, [], NOW).every((entry) => entry.state === 'not_released'), true);
});

test('upcoming checks use Melbourne dates and the match-day window', () => {
  assert.equal(melbourneDateKey(NOW), '2026-10-02');
  assert.equal(isUpcomingFixture('2026-10-02', NOW), true, 'today (Melbourne) is still upcoming for a date-only fixture');
  assert.equal(isUpcomingFixture('2026-10-01', NOW), false);
  assert.equal(isUpcomingFixture(new Date(NOW - MATCH_DAY_WINDOW_MS + 1000).toISOString(), NOW), true);
  assert.equal(isUpcomingFixture(new Date(NOW - MATCH_DAY_WINDOW_MS - 1000).toISOString(), NOW), false);
  assert.equal(isUpcomingFixture(null, NOW), false);
  assert.equal(isUpcomingFixture('not a date', NOW), false);
});

test('Melbourne formatting', () => {
  assert.equal(formatMatchDayDate('2026-10-03T02:30:00Z'), 'Sat 3 Oct, 12:30 pm');
  assert.equal(formatClubTime('2026-10-03T02:30:00Z'), '12:30 pm');
  assert.equal(formatClubTime('2026-10-03'), null);
  assert.deepEqual(comingUpDateParts('2026-10-03T02:30:00Z'), { weekday: 'Sat', day: '3', month: 'Oct' });
  assert.deepEqual(comingUpDateParts('2026-10-16'), { weekday: 'Fri', day: '16', month: 'Oct' });
  assert.equal(comingUpDateParts('nope'), null);
});

test('"This week" keeps fixtures within seven days and merges events by date', () => {
  const board = selectMatchDayBoard(teams, fixtures, NOW);
  const week = fixturesWithinDays(board, NOW);
  assert.deepEqual(week.map((entry) => entry.fixture.id), ['a-r2', 'b-live'], 'women (16 Oct) are outside the week');

  const items = mergeComingUp([
    { key: 'fixture-a', kind: 'fixture', startsAt: '2026-10-03T02:30:00Z', title: '1st XI v Ocean Grove CC', detail: null, href: '/fixtures', external: false, status: null },
    { key: 'event-1', kind: 'event', startsAt: '2026-10-02T08:00:00Z', title: 'Season Launch', detail: null, href: '/events/1', external: false, status: null },
    { key: 'calendar-1', kind: 'calendar', startsAt: '2026-10-02T09:00:00Z', title: 'Season launch', detail: null, href: '/calendar', external: false, status: null },
    { key: 'calendar-2', kind: 'calendar', startsAt: '2026-10-01T22:00:00Z', title: 'Junior training', detail: null, href: '/calendar', external: false, status: null },
    { key: 'calendar-bad', kind: 'calendar', startsAt: 'bad', title: 'Broken', detail: null, href: '/calendar', external: false, status: null },
  ]);
  assert.deepEqual(items.map((item) => item.key), ['calendar-2', 'event-1', 'fixture-a'], 'date order; same-day calendar copy of an event shown once; invalid dates dropped');
  assert.equal(allWithinDays(items, NOW), true);
  assert.equal(allWithinDays([...items, { ...items[0], key: 'later', startsAt: '2026-10-20T00:00:00Z' }], NOW), false);
});

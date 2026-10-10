#!/usr/bin/env node
import { normaliseFixtures, normaliseGrades, normaliseLadder, normaliseSeasons, normaliseTeams } from '../lib/playhq/normalise.ts';

function fail(message) { console.error(message); process.exit(1); }

const seasons = normaliseSeasons({ data: [{ seasonId: 'season-1', seasonName: 'Summer 2026/27' }] });
if (seasons[0]?.id !== 'season-1' || seasons[0]?.name !== 'Summer 2026/27') fail('normaliseSeasons should accept data arrays and seasonId/seasonName fields.');

const teams = normaliseTeams({ teams: [{ teamId: 'team-1', teamName: 'NDCC First XI', grade: { id: 'grade-1', name: 'A Grade' } }] });
if (teams[0]?.gradeId !== 'grade-1' || teams[0]?.gradeName !== 'A Grade') fail('normaliseTeams should preserve grade details.');

const grades = normaliseGrades([{ gradeId: 'grade-1', gradeName: 'A Grade' }]);
if (grades[0]?.id !== 'grade-1' || grades[0]?.name !== 'A Grade') fail('normaliseGrades should support array payloads.');

const fixtures = normaliseFixtures({ games: [{ gameId: 'game-1', homeTeam: { name: 'NDCC' }, awayTeamName: 'Opponent CC', scheduledStartTime: '2026-10-03T03:00:00Z', venueName: 'Dino Dome', publicUrl: 'https://example.test/game-1' }] }, grades[0]);
if (fixtures[0]?.id !== 'game-1' || fixtures[0]?.homeTeam !== 'NDCC' || fixtures[0]?.awayTeam !== 'Opponent CC') fail('normaliseFixtures should defensively read common cricket fixture fields.');
if (fixtures[0]?.playHQUrl !== 'https://example.test/game-1') fail('normaliseFixtures should preserve public PlayHQ links when supplied.');

const nested = normaliseFixtures({ data: { items: [{
  id: 'historical-game-1',
  status: 'FINALIZED',
  competitors: [
    { homeAway: 'HOME', team: { name: 'Newcomb & District 1st XI' } },
    { homeAway: 'AWAY', team: { name: 'Opponent CC' } },
  ],
  schedule: { date: '2026-03-14' },
}] } }, grades[0]);
if (nested[0]?.homeTeam !== 'Newcomb & District 1st XI' || nested[0]?.awayTeam !== 'Opponent CC') fail('normaliseFixtures should read nested PlayHQ competitor team names.');
if (nested[0]?.id !== 'historical-game-1' || nested[0]?.status !== 'FINALIZED') fail('normaliseFixtures should read nested data.items fixture envelopes.');

// PlayHQ gives a local date, time and time zone; the start time must survive.
const timed = (schedule, extra = {}) => normaliseFixtures({ games: [{ id: 'g', ...extra, schedule }] }, grades[0])[0]?.startsAt;
if (timed({ date: '2026-10-10', time: '13:00:00', timezone: 'Australia/Melbourne' }) !== '2026-10-10T13:00:00+11:00') fail('normaliseFixtures should combine schedule date, time and time zone (AEDT).');
if (timed({ date: '2026-09-26', time: '13:00', timezone: 'Australia/Melbourne' }) !== '2026-09-26T13:00:00+10:00') fail('normaliseFixtures should use AEST before daylight saving starts.');
if (timed({ date: '2026-10-04', time: '01:30:00', timezone: 'Australia/Melbourne' }) !== '2026-10-04T01:30:00+10:00') fail('normaliseFixtures should use AEST just before daylight saving starts.');
if (timed({ date: '2026-10-04', time: '03:30:00', timezone: 'Australia/Melbourne' }) !== '2026-10-04T03:30:00+11:00') fail('normaliseFixtures should use AEDT just after daylight saving starts.');
if (timed({ date: '2026-04-05', time: '01:30:00', timezone: 'Australia/Melbourne' }) !== '2026-04-05T01:30:00+11:00') fail('normaliseFixtures should use AEDT just before daylight saving ends.');
if (timed({ date: '2026-04-05', time: '03:30:00', timezone: 'Australia/Melbourne' }) !== '2026-04-05T03:30:00+10:00') fail('normaliseFixtures should use AEST after daylight saving ends.');
if (timed({ date: '2026-10-10', time: '13:00:00' }) !== '2026-10-10T13:00:00+11:00') fail('normaliseFixtures should default to Melbourne when no time zone is sent.');
if (timed([{ date: '2026-12-05', time: '11:00:00', timezone: 'Australia/Melbourne' }, { date: '2026-12-12', time: '11:00:00', timezone: 'Australia/Melbourne' }]) !== '2026-12-05T11:00:00+11:00') fail('normaliseFixtures should start multi-day games on the first schedule entry.');
if (timed({ date: '2026-10-10' }, { scheduledStartTime: '2026-10-10T02:30:00Z' }) !== '2026-10-10T02:30:00Z') fail('normaliseFixtures should prefer a timed field over a date-only one.');
if (timed({ date: '2026-10-10' }) !== '2026-10-10') fail('normaliseFixtures should keep date-only fixtures date-only (never invent a time).');
if (timed({ date: '2026-10-10', time: 'TBC' }) !== '2026-10-10') fail('normaliseFixtures should ignore a non-time value.');

// Scores from a real PlayHQ v1 team fixture (10 Oct 2026, GCA 4 1st XI), trimmed.
const competitor = (name, isHomeTeam, outcome, scoreTotal) => ({ id: name, name, isHomeTeam, outcome, scoreTotal, scoreSubTotal: [{ type: '', value: 0 }] });
const scored = (status, competitors) => normaliseFixtures({ data: [{ id: 'g', status, schedule: { date: '2026-10-10', time: '12:30:00', timezone: 'Australia/Melbourne' }, competitors }] }, grades[0])[0];
const final = scored('FINAL', [competitor('Teesdale 1st XI', false, 'LOST', 98), competitor('Newcomb & District 1sts', true, 'WON', 102)]);
if (final.homeTeam !== 'Newcomb & District 1sts' || final.homeScore !== '102' || final.awayScore !== '98') fail('normaliseFixtures should read competitor scoreTotal for a decided game.');
const abandoned = scored('ABANDONED', [competitor('Guild St. Marys', true, 'ABANDONED', 0), competitor('Newcomb & District 1sts', false, 'ABANDONED', 0)]);
if (abandoned.homeScore !== null || abandoned.awayScore !== null) fail('an abandoned game must not show 0 as a score.');
const unplayed = scored(undefined, [{ id: 'a', name: 'Teesdale 2nd XI', isHomeTeam: true }, { id: 'b', name: 'Newcomb & District 2nds', isHomeTeam: false }]);
if (unplayed.homeScore !== null || unplayed.awayScore !== null) fail('a game without an outcome has no score.');
const tied = scored('FINAL', [competitor('A', true, 'DRAW', 150), competitor('B', false, 'DRAW', 150)]);
if (tied.homeScore !== '150' || tied.awayScore !== '150') fail('a drawn game keeps both scores.');

const ladder = normaliseLadder({ ladder: [{ team: { name: 'NDCC' }, rank: 2, gamesPlayed: 5, points: '18', percent: '126.5' }] }, grades[0]);
if (ladder[0]?.teamName !== 'NDCC' || ladder[0]?.position !== 2 || ladder[0]?.played !== 5 || ladder[0]?.percentage !== 126.5) fail('normaliseLadder should parse common ladder fields.');

console.log('PlayHQ normalise static test passed.');

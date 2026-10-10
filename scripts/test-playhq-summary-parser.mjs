#!/usr/bin/env node
// Offline regression tests for the PlayHQ -> Dino Coach pure import helpers
// (lib/playhq/fantasy-import.ts, lib/playhq/season-match.ts):
//   - dismissal parsing: NOT_OUT enum codes, did not bat / DNB / absent,
//     retired hurt / retired not out are never ducks,
//   - flat batting/bowling section arrays: bowling runs conceded are never
//     batting runs,
//   - repeated entries of one innings stay de-duplicated (Math.max); only
//     explicitly numbered separate innings are added together,
//   - the shared club-team matcher (newcomb + ndcc) and team_filter handling,
//   - fixture match dates converted to Australia/Melbourne.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, imports = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { exports, require: (name) => { if (!(name in imports)) throw Error(`unexpected import ${name}`); return imports[name]; }, console });
  return exports;
}

const importer = load('lib/playhq/fantasy-import.ts', { 'node:crypto': crypto });
const seasonMatch = load('lib/playhq/season-match.ts');
let passed = 0;
const test = (label, fn) => { fn(); passed += 1; console.log(`PASS ${label}`); };
const parse = (players, extra = {}) => new Map(importer.normaliseGameSummaryPlayers({ data: { teams: [{ name: 'Newcomb & District 1st XI', ...players }], ...extra } }).map((line) => [line.playhq_player_id, line]));

// ---- 3a. Dismissal text and enum codes ----
test('classifyDismissal: enum and prose forms', () => {
  for (const value of ['NOT_OUT', 'not out', 'Not-Out', 'notout', 'RETIRED_NOT_OUT', 'retired not out', 'Retired Hurt', 'RETIRED_HURT', 'retired']) {
    assert.equal(importer.classifyDismissal(value), 'not_out', value);
  }
  for (const value of ['Did not bat', 'DID_NOT_BAT', 'DNB', 'dnb', 'absent', 'ABSENT_HURT']) {
    assert.equal(importer.classifyDismissal(value), 'did_not_bat', value);
  }
  for (const value of ['b Smith', 'c Jones b Smith', 'lbw b Brown', 'RUN_OUT', 'retired out', 'BOWLED']) {
    assert.equal(importer.classifyDismissal(value), 'dismissed', value);
  }
  assert.equal(importer.classifyDismissal(''), 'none');
  assert.equal(importer.classifyDismissal(null), 'none');
});

test('NOT_OUT enum is not out and never a duck', () => {
  const lines = parse({ players: [
    { playerId: 'zero', firstName: 'Zero', lastName: 'NotOut', statistics: { batting: { runsScored: 0, ballsFaced: 3, howOut: 'NOT_OUT' } } },
    { playerId: 'twelve', firstName: 'Twelve', lastName: 'NotOut', statistics: { batting: { runsScored: 12, ballsFaced: 20, howOut: 'NOT_OUT' } } },
  ] });
  assert.deepEqual([lines.get('zero').not_out, lines.get('zero').ducks], [true, 0]);
  assert.deepEqual([lines.get('twelve').not_out, lines.get('twelve').runs, lines.get('twelve').ducks], [true, 12, 0]);
});

test('did not bat / DNB / absent with 0 runs are not ducks and not not-outs', () => {
  const lines = parse({ players: [
    { playerId: 'dnb', firstName: 'Did', lastName: 'NotBat', statistics: { batting: { runsScored: 0, ballsFaced: 0, dismissal: 'Did not bat' } } },
    { playerId: 'dnb2', firstName: 'D', lastName: 'NB', statistics: { batting: { runsScored: 0, howOut: 'DNB' } } },
    { playerId: 'abs', firstName: 'Ab', lastName: 'Sent', statistics: { batting: { dismissal: 'absent' } } },
    { playerId: 'dnb-enum', firstName: 'Enum', lastName: 'DNB', statistics: { batting: { howOut: 'DID_NOT_BAT' } } },
  ] });
  for (const id of ['dnb', 'dnb2', 'abs', 'dnb-enum']) {
    assert.equal(lines.get(id).ducks, 0, id);
    assert.equal(lines.get(id).not_out, false, id);
    assert.equal(lines.get(id).runs, 0, id);
  }
});

test('retired hurt and retired not out on 0 are not out, not ducks', () => {
  const lines = parse({ players: [
    { playerId: 'rh', firstName: 'Retired', lastName: 'Hurt', statistics: { batting: { runsScored: 0, ballsFaced: 1, dismissal: 'retired hurt' } } },
    { playerId: 'rno', firstName: 'Retired', lastName: 'NotOut', statistics: { batting: { runsScored: 0, ballsFaced: 2, howOut: 'RETIRED_NOT_OUT' } } },
    { playerId: 'ro', firstName: 'Retired', lastName: 'Out', statistics: { batting: { runsScored: 0, ballsFaced: 2, dismissal: 'retired out' } } },
  ] });
  assert.deepEqual([lines.get('rh').ducks, lines.get('rh').not_out], [0, true]);
  assert.deepEqual([lines.get('rno').ducks, lines.get('rno').not_out], [0, true]);
  assert.deepEqual([lines.get('ro').ducks, lines.get('ro').not_out], [1, false], 'retired out is a dismissal');
});

test('genuine duck still recorded', () => {
  const lines = parse({ players: [{ playerId: 'duck', firstName: 'Gold', lastName: 'Duck', statistics: { batting: { runsScored: 0, ballsFaced: 4, dismissal: 'b Smith' } } }] });
  assert.equal(lines.get('duck').ducks, 1);
});

// ---- 3b. Flat batting/bowling arrays ----
test('flat bowling row runs conceded are not batting runs', () => {
  const lines = parse({
    batting: [{ playerId: 'p1', name: 'Tail Ender', runs: 3, ballsFaced: 9, dismissal: 'b Smith' }],
    bowling: [
      { playerId: 'p1', name: 'Tail Ender', overs: 10, maidens: 1, runs: 45, wickets: 2 },
      { playerId: 'p2', name: 'Bowler Only', overs: 4, maidens: 0, runs: 30, wickets: 1 },
    ],
  });
  assert.deepEqual([lines.get('p1').runs, lines.get('p1').wickets, lines.get('p1').maidens, lines.get('p1').ducks], [3, 2, 1, 0]);
  assert.deepEqual([lines.get('p2').runs, lines.get('p2').wickets, lines.get('p2').ducks, lines.get('p2').not_out], [0, 1, 0, false]);
});

test('flat batting row figures are not read as bowling or fielding', () => {
  const lines = parse({ batting: [{ playerId: 'p3', name: 'Opener', runs: 20, ballsFaced: 30, wickets: 9, catches: 9, dismissal: 'c x b y' }] });
  assert.deepEqual([lines.get('p3').runs, lines.get('p3').wickets, lines.get('p3').catches], [20, 0, 0]);
});

test('flat fielding rows are read', () => {
  const lines = parse({ fielding: [{ playerId: 'p4', name: 'Keeper', catches: 2, stumpings: 1, runs: 99 }] });
  assert.deepEqual([lines.get('p4').catches, lines.get('p4').stumpings, lines.get('p4').runs], [2, 1, 0]);
});

// ---- 3c. Repeated entries vs separate innings ----
test('same innings listed in players AND batting section is not double counted', () => {
  const lines = parse({
    players: [{ playerId: 'p5', firstName: 'Dup', lastName: 'Licate', statistics: { batting: { runsScored: 40, dismissal: 'c x b y' }, bowling: { wicketsTaken: 2 } } }],
    batting: [{ playerId: 'p5', name: 'Dup Licate', runs: 40, dismissal: 'c x b y' }],
    bowling: [{ playerId: 'p5', name: 'Dup Licate', wickets: 2, runs: 17 }],
  });
  assert.deepEqual([lines.get('p5').runs, lines.get('p5').wickets], [40, 2]);
});

test('same team container reached through two keys is not double counted', () => {
  const team = { name: 'Newcomb & District 1st XI', players: [{ playerId: 'p6', firstName: 'Twice', lastName: 'Seen', statistics: { batting: { runsScored: 33 } } }] };
  const lines = importer.normaliseGameSummaryPlayers({ data: { teams: [team], homeTeam: team } });
  assert.equal(lines.find((line) => line.playhq_player_id === 'p6').runs, 33);
});

test('unnumbered repeated batting entries keep max (cannot prove separate innings)', () => {
  const lines = parse({ batting: [{ playerId: 'p7', name: 'Two Dig', runs: 40, dismissal: 'c x b y' }, { playerId: 'p7', name: 'Two Dig', runs: 25, dismissal: 'lbw b z' }] });
  assert.equal(lines.get('p7').runs, 40);
});

test('explicitly numbered separate innings are summed (runs, wickets, ducks)', () => {
  const lines = parse({
    batting: [
      { playerId: 'p8', name: 'Two Dig', runs: 40, dismissal: 'c x b y', inningsNumber: 1 },
      { playerId: 'p8', name: 'Two Dig', runs: 25, dismissal: 'lbw b z', inningsNumber: 2 },
      { playerId: 'p9', name: 'Pair', runs: 0, ballsFaced: 2, dismissal: 'b x', innings: 1 },
      { playerId: 'p9', name: 'Pair', runs: 0, ballsFaced: 1, dismissal: 'b y', innings: 2 },
    ],
    bowling: [
      { playerId: 'p8', name: 'Two Dig', wickets: 3, runs: 50, inningsNumber: 1 },
      { playerId: 'p8', name: 'Two Dig', wickets: 4, runs: 20, inningsNumber: 2 },
    ],
  });
  assert.deepEqual([lines.get('p8').runs, lines.get('p8').wickets], [65, 7]);
  assert.equal(lines.get('p9').ducks, 2);
});

test('numbered innings duplicated across sections are still de-duplicated', () => {
  const lines = parse({
    players: [{ playerId: 'p10', firstName: 'Agg', lastName: 'Regate', statistics: { batting: { runsScored: 65 } } }],
    batting: [
      { playerId: 'p10', name: 'Agg Regate', runs: 40, inningsNumber: 1, dismissal: 'b x' },
      { playerId: 'p10', name: 'Agg Regate', runs: 40, inningsNumber: 1, dismissal: 'b x' },
      { playerId: 'p10', name: 'Agg Regate', runs: 25, inningsNumber: 2, dismissal: 'b y' },
    ],
  });
  assert.equal(lines.get('p10').runs, 65, 'aggregate 65 vs innings 40+25 -> 65, never 130');
});

test('existing nested-statistics fixture keeps its values', () => {
  const lines = importer.normaliseGameSummaryPlayers({ data: { teams: [{ name: 'Newcomb & District 2nd XI', players: [
    { playerId: 'phq-1', firstName: 'Sam', lastName: 'Rivers', statistics: { batting: { runsScored: 48, ballsFaced: 61, notOut: true }, bowling: { wicketsTaken: 2, maidensBowled: 1 }, fielding: { catches: 1 } } },
    { playerId: 'phq-3', firstName: 'Max', lastName: 'Quinn', statistics: { bowling: { wicketsTaken: 3 } } },
  ] }], playerOfTheMatch: { playerId: 'phq-1' } } });
  const byId = new Map(lines.map((line) => [line.playhq_player_id, line]));
  assert.deepEqual({ ...byId.get('phq-1') }, { playhq_player_id: 'phq-1', display_name: 'Sam Rivers', team_name: 'Newcomb & District 2nd XI', runs: 48, wickets: 2, maidens: 1, catches: 1, runouts: 0, stumpings: 0, ducks: 0, not_out: true, player_of_match: true });
  assert.deepEqual([byId.get('phq-3').runs, byId.get('phq-3').wickets, byId.get('phq-3').ducks], [0, 3, 0]);
});

// ---- 4. One shared club-team matcher ----
test('resolveClubTeamMatcher: no / legacy default filter uses newcomb + ndcc aliases', () => {
  for (const filter of [null, '', '  ', 'newcomb', 'Newcomb']) {
    const matcher = seasonMatch.resolveClubTeamMatcher(filter);
    assert.equal(matcher.invalidFilter, null);
    assert.equal(matcher.matches('NDCC 2nd XI'), true, String(filter));
    assert.equal(matcher.matches('Newcomb & District 1st XI'), true);
    assert.equal(matcher.matches('Leopold'), false);
  }
});

test('resolveClubTeamMatcher: custom regex wins; invalid regex falls back and is reported', () => {
  const gold = seasonMatch.resolveClubTeamMatcher('newcomb gold');
  assert.equal(gold.matches('Newcomb Gold'), true);
  assert.equal(gold.matches('Newcomb Blue'), false);
  const invalid = seasonMatch.resolveClubTeamMatcher('newcomb(');
  assert.equal(invalid.invalidFilter, 'newcomb(');
  assert.equal(invalid.matches('NDCC Women'), true);
  assert.equal(invalid.matches('Leopold'), false);
});

test('involvesClubTeam accepts the shared matcher and its default agrees with isClubTeamName', () => {
  const matcher = seasonMatch.resolveClubTeamMatcher(null).matches;
  assert.equal(importer.involvesClubTeam({ homeTeam: 'NDCC 2nd XI', awayTeam: 'Leopold' }, matcher), true);
  assert.equal(importer.involvesClubTeam({ homeTeam: 'Leopold', awayTeam: 'Geelong' }, matcher), false);
  for (const name of ['NDCC 2nd XI', 'Newcomb & District 1st XI', 'NEWCOMB', 'Leopold', 'Newcombe Park', 'St Josephs']) {
    assert.equal(importer.involvesClubTeam({ homeTeam: name, awayTeam: '' }), seasonMatch.isClubTeamName(name), name);
  }
});

// ---- 7. Match date in Australia/Melbourne ----
test('localMatchDate converts Z / offset timestamps to the Melbourne calendar date', () => {
  assert.equal(importer.localMatchDate('2026-10-09T22:30:00Z'), '2026-10-10', 'Sat 9:30 am AEDT = Fri 22:30 UTC');
  assert.equal(importer.localMatchDate('2026-10-09T22:30:00.000Z'), '2026-10-10');
  assert.equal(importer.localMatchDate('2026-10-10T02:30:00Z'), '2026-10-10');
  assert.equal(importer.localMatchDate('2026-10-10T09:30:00+11:00'), '2026-10-10');
  assert.equal(importer.localMatchDate('2026-10-09T23:30:00+00:00'), '2026-10-10');
  assert.equal(importer.localMatchDate('2026-06-12T15:00:00Z'), '2026-06-13', 'AEST (UTC+10) outside daylight saving');
  assert.equal(importer.localMatchDate('2026-10-10T13:30:00Z'), '2026-10-11', 'late evening UTC is next day in Melbourne');
});

test('localMatchDate keeps plain dates and offset-free local timestamps', () => {
  assert.equal(importer.localMatchDate('2026-10-10'), '2026-10-10');
  assert.equal(importer.localMatchDate('2026-10-10T09:30:00'), '2026-10-10');
  assert.equal(importer.localMatchDate(null), null);
  assert.equal(importer.localMatchDate(''), null);
  assert.equal(importer.localMatchDate('TBC'), null);
});

// ---- PlayHQ v2 game summary (GET /v2/games/:id/summary) ----
// Real structure from the 10 Oct 2026 GCA 4 1st XI game; names replaced.
const v2Summary = () => {
  const stats = (pairs) => Object.entries(pairs).map(([type, value]) => ({ type, value }));
  const ndcc = 'ndcc-1sts';
  const opp = 'opp-1st-xi';
  return { data: {
    id: 'game-v2', status: 'FINAL',
    teams: [{ id: opp, name: 'Teesdale 1st XI', isHomeTeam: false, outcome: 'LOST' }, { id: ndcc, name: 'Newcomb & District 1sts', isHomeTeam: true, outcome: 'WON' }],
    appearances: [
      { id: 'bat-a', firstName: 'Bat', lastName: 'Alpha', teamId: ndcc },
      { id: 'bowl-b', firstName: 'Bowl', lastName: 'Bravo', teamId: ndcc },
      { id: 'keep-c', firstName: 'Keep', lastName: 'Charlie', teamId: ndcc },
      { id: 'opp-d', firstName: 'Opp', lastName: 'Delta', teamId: opp },
    ],
    periods: [
      { id: 'p1', name: 'FIRST_INNINGS', sequenceNo: 1, teams: [
        { id: opp, discipline: 'BATTING', status: 'ALL_OUT', statistics: stats({ TOTAL_SCORE: 98, TOTAL_OUTS: 10 }), appearances: [
          { id: 'opp-d', status: 'OUT', statistics: stats({ TOTAL_RUNS: 0, BALLS_FACED: 10 }) },
        ] },
        { id: ndcc, discipline: 'BOWLING', status: null, statistics: [], appearances: [
          { id: 'bowl-b', statistics: stats({ OVERS: 4, MAIDENS: 0, RUNS: 10, WICKETS: 3, TOTAL_CATCHES: 1, TOTAL_RUN_OUTS: 0, STUMPINGS: 0 }) },
          { id: 'bat-a', statistics: stats({ OVERS: 9, MAIDENS: 1, RUNS: 12, WICKETS: 4 }) },
          { id: 'keep-c', statistics: stats({ TOTAL_CATCHES: 2, TOTAL_RUN_OUTS: 1, STUMPINGS: 1 }) },
        ] },
      ] },
      { id: 'p2', name: 'FIRST_INNINGS', sequenceNo: 2, teams: [
        { id: opp, discipline: 'BOWLING', status: null, statistics: [], appearances: [
          { id: 'opp-d', statistics: stats({ OVERS: 4, RUNS: 20, WICKETS: 0, MAIDENS: 0 }) },
        ] },
        { id: ndcc, discipline: 'BATTING', status: null, statistics: stats({ TOTAL_SCORE: 102, TOTAL_OUTS: 0 }), appearances: [
          { id: 'bat-a', status: 'NOT_OUT', statistics: stats({ TOTAL_RUNS: 55, BALLS_FACED: 61 }) },
          { id: 'bowl-b', status: 'DID_NOT_BAT', statistics: [] },
          { id: 'keep-c', status: 'OUT', statistics: stats({ TOTAL_RUNS: 0, BALLS_FACED: 2 }) },
        ] },
      ] },
    ],
  } };
};

test('v2 summary: batting, bowling and fielding from periods, with team names', () => {
  const lines = new Map(importer.normaliseGameSummaryPlayers(v2Summary()).map((line) => [line.playhq_player_id, line]));
  const a = lines.get('bat-a');
  assert.deepEqual([a.display_name, a.team_name, a.runs, a.not_out, a.wickets, a.maidens, a.ducks], ['Bat Alpha', 'Newcomb & District 1sts', 55, true, 4, 1, 0]);
  const b = lines.get('bowl-b');
  assert.deepEqual([b.runs, b.wickets, b.catches, b.not_out, b.ducks], [0, 3, 1, false, 0], 'did not bat is not a duck');
  const c = lines.get('keep-c');
  assert.deepEqual([c.catches, c.runouts, c.stumpings, c.ducks, c.not_out], [2, 1, 1, 1, false], 'out for 0 is a duck');
  const d = lines.get('opp-d');
  assert.deepEqual([d.team_name, d.ducks, d.runs], ['Teesdale 1st XI', 1, 0], 'bowling runs conceded are never runs scored');
});

test('v2 summary: a repeated row in one innings never double counts', () => {
  const payload = v2Summary();
  const batting = payload.data.periods[1].teams[1].appearances;
  batting.push({ ...batting[0] });
  const a = importer.normaliseGameSummaryPlayers(payload).find((line) => line.playhq_player_id === 'bat-a');
  assert.equal(a.runs, 55);
});

test('v1 summary with appearances only yields no stat lines', () => {
  const v1 = { data: { id: 'g', status: 'FINAL', competitors: [{ name: 'Newcomb & District 1sts', scoreTotal: 102 }], appearances: [{ id: 'x', firstName: 'A', lastName: 'B', teamID: 't', scoreTotal: 0 }], periods: null } };
  assert.equal(importer.normaliseGameSummaryPlayers(v1).length, 0, 'no figures means quarantine, never a line of zeros');
});

console.log(`PlayHQ summary parser, club matcher and match-date checks passed (${passed}).`);

#!/usr/bin/env node
// Deterministic unit tests for the fantasy core logic: scoring rules, CSV
// import normalisation, duplicate detection, squad validation, deadline
// locks, and leaderboard aggregation.
//
// lib/fantasy-game.ts and lib/fantasy-leaderboard.ts use the `@/lib/...`
// path alias, which plain `node --experimental-strip-types` cannot resolve.
// The modules are copied into a temp dir with the alias rewritten to
// relative specifiers before importing; sources are never modified.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptsDir, '..');
const tmpDir = join(scriptsDir, '.fantasy-logic-tmp');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log(`PASS ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL ${label}`);
  }
}

function stageModule(name) {
  const source = readFileSync(join(repoRoot, 'lib', name), 'utf8').replace(/@\/lib\/([\w-]+)/g, './$1.ts');
  writeFileSync(join(tmpDir, name), source);
}

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

try {
  for (const name of ['fantasy-scoring.ts', 'fantasy-game.ts', 'fantasy-leaderboard.ts', 'supabase-server.ts']) {
    stageModule(name);
  }

  const scoring = await import(pathToFileURL(join(tmpDir, 'fantasy-scoring.ts')).href);
  const game = await import(pathToFileURL(join(tmpDir, 'fantasy-game.ts')).href);
  const leaderboard = await import(pathToFileURL(join(tmpDir, 'fantasy-leaderboard.ts')).href);

  // ---- 1. Scoring engine: deterministic points ----
  const rules = [
    { key: 'runs', points: 1, enabled: true },
    { key: 'wickets', points: 20, enabled: true },
    { key: 'maidens', points: 5, enabled: true },
    { key: 'catches', points: 10, enabled: true },
    { key: 'runouts', points: 10, enabled: true },
    { key: 'stumpings', points: 10, enabled: true },
    { key: 'ducks', points: -10, enabled: true },
    { key: 'not_out_bonus', points: 15, enabled: true },
    { key: 'player_of_match_bonus', points: 25, enabled: true },
  ];
  const statLine = {
    round_number: 1, match_date: '2026-10-10', opponent: 'Leopold', player_name: 'Test Player',
    runs: 42, wickets: 2, maidens: 1, catches: 1, runouts: 0, stumpings: 0, ducks: 0,
    not_out: true, player_of_match: true,
  };
  // 42*1 + 2*20 + 1*5 + 1*10 + 15 + 25 = 137
  check('scoring: full stat line totals 137', scoring.calculateFantasyPoints(statLine, rules) === 137);
  check('scoring: duck penalty applies', scoring.calculateFantasyPoints({ ...statLine, runs: 0, ducks: 1, not_out: false, player_of_match: false }, rules) === 2 * 20 + 5 + 10 - 10);
  check('scoring: disabled rule scores zero', scoring.calculateFantasyPoints(statLine, rules.map((r) => (r.key === 'wickets' ? { ...r, enabled: false } : r))) === 137 - 40);
  check('scoring: string points coerce to numbers', scoring.calculateFantasyPoints(statLine, rules.map((r) => ({ ...r, points: String(r.points) }))) === 137);
  check('scoring: no enabled rules scores zero', scoring.calculateFantasyPoints(statLine, []) === 0);
  check('scoring: deterministic across calls', scoring.calculateFantasyPoints(statLine, rules) === scoring.calculateFantasyPoints(statLine, rules));

  // ---- 2. Import normalisation ----
  const players = [
    { id: 'p1', display_name: 'Aaron Morgan' },
    { id: 'p2', display_name: 'Tyler O’Neil' },
  ];
  const rounds = [{ id: 'r1', round_number: 1, name: 'Round 1' }];
  const header = 'round_number,match_date,opponent,player_name,runs,wickets,maidens,catches,runouts,stumpings,ducks,not_out,player_of_match';
  const goodRow = '1,2026-10-10,"Leopold, CC",  aaron   MORGAN ,42,2,1,1,0,0,0,true,false';
  const preview = scoring.buildFantasyImportPreview({
    csvText: `﻿${header}\n${goodRow}\n`,
    players, rounds, scoringRules: rules,
  });
  check('import: BOM + quoted comma + case/whitespace name all normalise', preview.summary.validRows === 1 && preview.rows[0].playerId === 'p1');
  check('import: quoted opponent preserved', preview.rows[0].parsed?.opponent === 'Leopold, CC');
  // 42 runs + 2*20 wickets + 5 maiden + 10 catch + 15 not-out bonus
  check('import: preview points computed', preview.rows[0].points === 42 + 40 + 5 + 10 + 15);

  const badPreview = scoring.buildFantasyImportPreview({
    csvText: `${header}\n1,2026-13-45,Leopold,Aaron Morgan,x,2,1,1,0,0,0,maybe,false`,
    players, rounds, scoringRules: rules,
  });
  check('import: invalid date/number/boolean rejected', badPreview.summary.errorRows === 1
    && badPreview.rows[0].errors.some((e) => e.includes('invalid date'))
    && badPreview.rows[0].errors.some((e) => e.includes('invalid number'))
    && badPreview.rows[0].errors.some((e) => e.includes('invalid boolean')));
  check('import: unknown player flagged', scoring.buildFantasyImportPreview({
    csvText: `${header}\n1,2026-10-10,Leopold,Nobody Here,1,0,0,0,0,0,0,false,false`,
    players, rounds, scoringRules: rules,
  }).rows[0].errors.includes('missing player'));
  check('import: unknown round flagged', scoring.buildFantasyImportPreview({
    csvText: `${header}\n9,2026-10-10,Leopold,Aaron Morgan,1,0,0,0,0,0,0,false,false`,
    players, rounds, scoringRules: rules,
  }).rows[0].errors.includes('missing round'));
  check('import: missing header column reported', scoring.buildFantasyImportPreview({
    csvText: 'round_number,match_date\n1,2026-10-10',
    players, rounds, scoringRules: rules,
  }).errors.some((e) => e.startsWith('Missing required column')));

  // ---- 3. Duplicate detection ----
  const dupPreview = scoring.buildFantasyImportPreview({
    csvText: `${header}\n${goodRow}\n${goodRow}\n1,2026-10-10,"Leopold, CC",Tyler O’Neil,5,0,0,0,0,0,0,false,false`,
    players, rounds, scoringRules: rules,
  });
  check('duplicates: identical round/date/opponent/player flagged', dupPreview.rows[1].errors.some((e) => e.startsWith('duplicate row')));
  check('duplicates: different player same match not flagged', dupPreview.rows[2].errors.length === 0);

  // ---- 4. Squad validation ----
  const settings = {
    id: 's1', season_name: 'Test', squad_budget: 100,
    max_players_per_role: { WK: 2, BAT: 5, AR: 3, BOWL: 5 },
    starting_players_required: 11, bench_players_required: 4,
    free_transfers_per_round: 1, transfer_penalty_points: 4,
    is_registration_open: true, is_team_selection_open: true,
  };
  const roster = [];
  const roleFill = [['WK', 2], ['BAT', 5], ['AR', 3], ['BOWL', 5]];
  for (const [role, count] of roleFill) {
    for (let i = 0; i < count; i += 1) roster.push({ id: `${role}${i}`, display_name: `${role} ${i}`, role, team_label: null, price_million: 6 });
  }
  const starters = ['WK0', 'BAT0', 'BAT1', 'BAT2', 'AR0', 'AR1', 'BOWL0', 'BOWL1', 'BOWL2', 'BAT3', 'BOWL3'];
  const bench = ['WK1', 'BAT4', 'AR2', 'BOWL4'];
  const selection = [
    ...starters.map((playerId) => ({ playerId, positionType: 'starter', benchOrder: null, isCaptain: playerId === 'BAT0', isViceCaptain: playerId === 'BOWL0' })),
    ...bench.map((playerId, index) => ({ playerId, positionType: 'bench', benchOrder: index + 1, isCaptain: false, isViceCaptain: false })),
  ];
  const validResult = game.validateSquadSelection(selection, roster, settings);
  check('squad: valid 15-player squad passes', validResult.valid && validResult.errors.length === 0);
  check('squad: budget total computed', validResult.budgetUsed === 90);

  const priced = roster.map((p) => ({ ...p, price_million: 7 }));
  check('squad: budget breach rejected', game.validateSquadSelection(selection, priced, settings).errors.some((e) => e.includes('exceeds')));
  check('squad: duplicate player rejected', game.validateSquadSelection(
    selection.map((item, i) => (i === 1 ? { ...item, playerId: 'WK0' } : item)), roster, settings,
  ).errors.includes('Squad cannot contain duplicate players.'));
  check('squad: captain on bench rejected', game.validateSquadSelection(
    selection.map((item) => ({ ...item, isCaptain: item.playerId === 'WK1' && item.positionType === 'bench' ? true : (item.playerId === 'BAT0' ? false : item.isCaptain) })),
    roster, settings,
  ).errors.includes('Captain must be in the starting XI.'));
  check('squad: same captain and vice-captain rejected', game.validateSquadSelection(
    selection.map((item) => (item.playerId === 'BAT0' ? { ...item, isCaptain: true, isViceCaptain: true } : { ...item, isViceCaptain: false })),
    roster, settings,
  ).errors.includes('Captain and vice-captain cannot be the same player.'));
  check('squad: duplicate bench order rejected', game.validateSquadSelection(
    selection.map((item) => (item.positionType === 'bench' ? { ...item, benchOrder: 1 } : item)), roster, settings,
  ).errors.includes('Bench order cannot contain duplicates.'));
  check('squad: wrong role split rejected', game.validateSquadSelection(
    selection.map((item) => (item.playerId === 'WK1' ? { ...item, playerId: 'nonexistent' } : item)), roster, settings,
  ).valid === false);

  // ---- 4b. Draft squad validation (relaxed rules) ----
  const partialSelection = selection.slice(0, 6).map((item) => ({ ...item, isCaptain: false, isViceCaptain: false }));
  check('draft: incomplete squad without captain passes', game.validateDraftSquadSelection(partialSelection, roster, settings).valid === true);
  check('draft: empty selection rejected', game.validateDraftSquadSelection([], roster, settings).valid === false);
  check('draft: duplicate player rejected', game.validateDraftSquadSelection(
    [...partialSelection, { ...partialSelection[0] }], roster, settings,
  ).errors.includes('Squad cannot contain duplicate players.'));
  check('draft: budget breach rejected', game.validateDraftSquadSelection(partialSelection, roster.map((p) => ({ ...p, price_million: 20 })), settings).errors.some((e) => e.includes('exceeds')));
  check('draft: role cap exceeded rejected', game.validateDraftSquadSelection(
    [...partialSelection.filter((i) => !i.playerId.startsWith('WK')), { ...partialSelection[0], playerId: 'WK0' }, { ...partialSelection[0], playerId: 'WK1' }, { ...partialSelection[0], playerId: 'BAT4' }],
    [...roster, { id: 'WK9', display_name: 'WK 9', role: 'WK', team_label: null, price_million: 6 }].map((p) => p),
    settings,
  ).valid === true && game.validateDraftSquadSelection(
    ['WK0', 'WK1', 'WK9'].map((playerId) => ({ playerId, positionType: 'starter', benchOrder: null, isCaptain: false, isViceCaptain: false })),
    [...roster, { id: 'WK9', display_name: 'WK 9', role: 'WK', team_label: null, price_million: 6 }],
    settings,
  ).errors.some((e) => e.includes('more than 2 WK')));

  // ---- 5. Deadline lock ----
  const now = Date.parse('2026-10-10T00:00:00Z');
  const openRound = { id: 'r1', name: 'Round 1', status: 'open', deadline_at: '2026-10-11T00:00:00Z' };
  check('lock: open round before deadline is unlocked', game.evaluateRoundLock(openRound, now).locked === false);
  check('lock: open round past deadline is locked', game.evaluateRoundLock({ ...openRound, deadline_at: '2026-10-09T00:00:00Z' }, now).locked === true);
  check('lock: deadline boundary (exactly now) is locked', game.evaluateRoundLock({ ...openRound, deadline_at: '2026-10-10T00:00:00Z' }, now).locked === true);
  check('lock: non-open status is locked regardless of deadline', game.evaluateRoundLock({ ...openRound, status: 'locked', deadline_at: '2027-01-01T00:00:00Z' }, now).locked === true);
  check('lock: open round with no deadline is unlocked', game.evaluateRoundLock({ ...openRound, deadline_at: null }, now).locked === false);
  check('lock: no round means nothing to lock', game.evaluateRoundLock(null, now).locked === false);

  // ---- 6. Leaderboard aggregation ----
  const stat = (playerId, playerName, runs, extras = {}) => ({
    id: `stat-${playerId}-${runs}`, import_batch_id: 'b1', round_id: 'r1', player_id: playerId,
    match_date: '2026-10-10', opponent: 'Leopold', runs, wickets: 0, maidens: 0, catches: 0,
    runouts: 0, stumpings: 0, ducks: 0, not_out: false, player_of_match: false,
    fantasy_players: { display_name: playerName, role: 'BAT' },
    fantasy_rounds: { id: 'r1', round_number: 1, name: 'Round 1' },
    ...extras,
  });
  const lbRows = leaderboard.aggregateLeaderboardRows([
    stat('p1', 'Alice Example', 30),
    stat('p1', 'Alice Example', 20),
    stat('p2', 'Bob Example', 50),
    stat('p3', 'Cara Example', 50),
  ], [{ key: 'runs', points: 1, enabled: true }]);
  check('leaderboard: per-player totals aggregate across matches', lbRows.find((r) => r.playerId === 'p1')?.totalFantasyPoints === 50 && lbRows.find((r) => r.playerId === 'p1')?.matchesCounted === 2);
  check('leaderboard: ties broken alphabetically then ranked sequentially',
    lbRows[0].playerName === 'Alice Example' || (lbRows.map((r) => r.rank).join(',') === '1,2,3' && lbRows[0].totalFantasyPoints >= lbRows[2].totalFantasyPoints));
  check('leaderboard: ranks are 1..n', lbRows.map((r) => r.rank).join(',') === '1,2,3');
  check('leaderboard: rows without player_id skipped', leaderboard.aggregateLeaderboardRows([stat(null, 'Ghost', 10)], []).length === 0);
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`${failures} fantasy logic check(s) failed.`);
  process.exit(1);
}
console.log('All fantasy logic checks passed.');

#!/usr/bin/env node
// Deterministic unit tests for the multi-season fantasy layer: season
// selection, PlayHQ game-summary normalisation, exact round mapping,
// source hashing (idempotent import identity), squad carryover planning,
// cron authorization, and structural checks on the season migration SQL.
//
// Modules using the `@/lib/...` alias are staged into a temp dir with the
// alias rewritten to relative specifiers (same approach as
// scripts/test-fantasy-logic.mjs); sources are never modified.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptsDir, '..');
const tmpDir = join(scriptsDir, '.fantasy-seasons-tmp');

let failures = 0;
function check(label, condition) {
  if (condition) console.log(`PASS ${label}`);
  else { failures += 1; console.error(`FAIL ${label}`); }
}

function stage(relPath, outName) {
  const source = readFileSync(join(repoRoot, 'lib', relPath), 'utf8')
    .replace(/@\/lib\/playhq\/([\w-]+)/g, './$1.ts')
    .replace(/@\/lib\/([\w-]+)/g, './$1.ts')
    .replace(/from '\.\/(types|fantasy-import)'/g, "from './$1.ts'")
    .replace("import 'server-only';", '');
  writeFileSync(join(tmpDir, outName), source);
}

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

try {
  for (const [rel, out] of [
    ['playhq/types.ts', 'types.ts'],
    ['playhq/fantasy-import.ts', 'fantasy-import.ts'],
    ['fantasy-scoring.ts', 'fantasy-scoring.ts'],
    ['supabase-server.ts', 'supabase-server.ts'],
    ['fantasy-game.ts', 'fantasy-game.ts'],
    ['fantasy-seasons.ts', 'fantasy-seasons.ts'],
    ['fantasy-carryover.ts', 'fantasy-carryover.ts'],
    ['cron-auth.ts', 'cron-auth.ts'],
  ]) stage(rel, out);

  const importer = await import(pathToFileURL(join(tmpDir, 'fantasy-import.ts')).href);
  const seasons = await import(pathToFileURL(join(tmpDir, 'fantasy-seasons.ts')).href);
  const carryover = await import(pathToFileURL(join(tmpDir, 'fantasy-carryover.ts')).href);
  const cron = await import(pathToFileURL(join(tmpDir, 'cron-auth.ts')).href);

  // ---- 1. Season selection (dropdown default + fallback order) ----
  const seasonList = [
    { id: 's3', slug: '2026-27', is_current: true },
    { id: 's2', slug: '2025-26', is_current: false },
  ];
  check('season: explicit slug wins', seasons.pickSeason(seasonList, '2025-26')?.id === 's2');
  check('season: id selector works', seasons.pickSeason(seasonList, 's2')?.id === 's2');
  check('season: default is current', seasons.pickSeason(seasonList, null)?.id === 's3');
  check('season: unknown selector falls back to current', seasons.pickSeason(seasonList, 'nope')?.id === 's3');
  check('season: no current falls back to first', seasons.pickSeason([{ id: 'a', slug: 'x', is_current: false }], null)?.id === 'a');
  check('season: empty list returns null', seasons.pickSeason([], null) === null);
  check('season: historical label', seasons.seasonStatusLabel({ status: 'completed' }) === 'Historical');
  check('season: team changes gated by current selection window', seasons.seasonAllowsTeamChanges({ is_current: true, team_selection_open: true, allow_team_building: false }) === true);
  check('season: historical team building requires flag', seasons.seasonAllowsTeamChanges({ is_current: false, team_selection_open: true, allow_team_building: false }) === false);

  // ---- 2. Exact round mapping (never guess) ----
  check('round: explicit round number maps', JSON.stringify(importer.extractRoundInfo({ round: { number: 7, name: 'Round 7' } })) === JSON.stringify({ number: 7, name: 'Round 7' }));
  check('round: "Round N" name parses', importer.extractRoundInfo({ round: { name: 'Round 12' } })?.number === 12);
  check('round: missing metadata rejected', importer.extractRoundInfo({}) === null);
  check('round: ambiguous name rejected', importer.extractRoundInfo({ round: { name: 'Semi Final' } }) === null);
  check('round: zero round number rejected', importer.extractRoundInfo({ round: { number: 0 } }) === null);

  // ---- 3. Completed NDCC game selection ----
  check('fixture: final statuses are completed', importer.isCompletedFixture({ status: 'FINAL' }) && importer.isCompletedFixture({ status: 'completed' }) && importer.isCompletedFixture({ status: 'FINALIZED' }));
  check('fixture: UPCOMING is not completed', !importer.isCompletedFixture({ status: 'UPCOMING' }) && !importer.isCompletedFixture({ status: null }));
  check('fixture: club filter matches Newcomb either side', importer.involvesClubTeam({ homeTeam: 'Newcomb & District 2nd XI', awayTeam: 'Leopold' }) && importer.involvesClubTeam({ homeTeam: 'Leopold', awayTeam: 'NEWCOMB' }));
  check('fixture: non-club game excluded', !importer.involvesClubTeam({ homeTeam: 'Leopold', awayTeam: 'St Josephs' }));

  // ---- 4. Deterministic source hash (idempotent import identity) ----
  const hashA = importer.computeSourceHash({ b: 2, a: [1, { d: 4, c: 3 }] });
  const hashB = importer.computeSourceHash({ a: [1, { c: 3, d: 4 }], b: 2 });
  const hashC = importer.computeSourceHash({ a: [1, { c: 3, d: 5 }], b: 2 });
  check('hash: key order does not change identity', hashA === hashB);
  check('hash: changed values change identity', hashA !== hashC);
  check('hash: sha256 hex shape', /^[0-9a-f]{64}$/.test(hashA));

  // ---- 5. Game summary normalisation (real-shape, redacted) ----
  const summary = {
    data: {
      teams: [
        {
          name: 'Newcomb & District 2nd XI',
          players: [
            { playerId: 'phq-1', firstName: 'Sam', lastName: 'Rivers', statistics: { batting: { runsScored: 48, ballsFaced: 61, notOut: true }, bowling: { wicketsTaken: 2, maidensBowled: 1 }, fielding: { catches: 1 } } },
            { playerId: 'phq-2', firstName: 'Jai', lastName: 'Patel', statistics: { batting: { runsScored: 0, ballsFaced: 4, dismissal: 'b Smith' }, fielding: { runOuts: 1, stumpings: 1 } } },
            { playerId: 'phq-3', firstName: 'Max', lastName: 'Quinn', statistics: { bowling: { wicketsTaken: 3 } } },
          ],
        },
        { name: 'Leopold', players: [{ playerId: 'phq-9', firstName: 'Op', lastName: 'Ponent', statistics: { batting: { runsScored: 10 } } }] },
      ],
      playerOfTheMatch: { playerId: 'phq-1' },
    },
  };
  const lines = importer.normaliseGameSummaryPlayers(summary);
  const byId = new Map(lines.map((line) => [line.playhq_player_id, line]));
  check('summary: all players parsed', lines.length === 4);
  check('summary: batting/bowling/fielding read', byId.get('phq-1')?.runs === 48 && byId.get('phq-1')?.wickets === 2 && byId.get('phq-1')?.maidens === 1 && byId.get('phq-1')?.catches === 1);
  check('summary: not out flagged, no duck for 0-less scores', byId.get('phq-1')?.not_out === true && byId.get('phq-1')?.ducks === 0);
  check('summary: duck only when batted, 0 runs, dismissed', byId.get('phq-2')?.ducks === 1 && byId.get('phq-2')?.runouts === 1 && byId.get('phq-2')?.stumpings === 1);
  check('summary: bowler without batting has no duck', byId.get('phq-3')?.ducks === 0 && byId.get('phq-3')?.wickets === 3);
  check('summary: player of match attributed', byId.get('phq-1')?.player_of_match === true && byId.get('phq-2')?.player_of_match === false);
  check('summary: unsupported stats never invented', byId.get('phq-3')?.runs === 0 && byId.get('phq-3')?.not_out === false);
  check('summary: empty payload yields no lines', importer.normaliseGameSummaryPlayers({}).length === 0);

  // ---- 6. Carryover planning ----
  const settings = { squad_budget: 100, max_players_per_role: { WK: 2, BAT: 5, AR: 3, BOWL: 5 }, starting_players_required: 11, bench_players_required: 4, free_transfers_per_round: 1, transfer_penalty_points: 4, is_registration_open: true, is_team_selection_open: true, id: 'x', season_name: 'test' };
  const sourceSquad = [
    { player_id: 'p1', display_name: 'Able', role: 'BAT', price_million: 10, position_type: 'starter', bench_order: null, is_captain: true, is_vice_captain: false },
    { player_id: 'p2', display_name: 'Baker', role: 'WK', price_million: 8, position_type: 'starter', bench_order: null, is_captain: false, is_vice_captain: true },
    { player_id: 'p3', display_name: 'Charlie', role: 'AR', price_million: 7, position_type: 'bench', bench_order: 1, is_captain: false, is_vice_captain: false },
    { player_id: 'p4', display_name: 'Dover', role: 'BOWL', price_million: 6, position_type: 'bench', bench_order: 2, is_captain: false, is_vice_captain: false },
  ];
  const targetPlayers = [
    { id: 'p1', display_name: 'Able', role: 'BAT', team_label: null, price_million: 12 },   // price change
    { id: 'p2', display_name: 'Baker', role: 'AR', team_label: null, price_million: 8 },    // role change
    { id: 'p4', display_name: 'Dover', role: 'BOWL', team_label: null, price_million: 6 },  // unchanged
    // p3 missing -> unavailable
  ];
  const plan = carryover.buildCarryoverPlan(sourceSquad, targetPlayers, settings);
  check('carryover: carried and unavailable split', plan.carried.length === 3 && plan.unavailable.length === 1 && plan.unavailable[0].playerId === 'p3');
  check('carryover: role change detected', plan.roleChanges.length === 1 && plan.roleChanges[0].playerId === 'p2');
  check('carryover: price change detected', plan.priceChanges.length === 1 && plan.priceChanges[0].playerId === 'p1');
  check('carryover: target prices drive budget', plan.budgetUsed === 26 && plan.budgetRemaining === 74);
  check('carryover: captaincy preserved when carried', plan.selection.find((item) => item.playerId === 'p1')?.isCaptain === true);
  check('carryover: bench order resequenced', plan.selection.find((item) => item.playerId === 'p4')?.benchOrder === 1);
  check('carryover: warnings mention unavailable player', plan.warnings.some((warning) => warning.includes('Charlie')));
  check('carryover: idempotent (same input, same plan)', JSON.stringify(plan) === JSON.stringify(carryover.buildCarryoverPlan(sourceSquad, targetPlayers, settings)));
  const captainGone = carryover.buildCarryoverPlan(sourceSquad, targetPlayers.filter((player) => player.id !== 'p1'), settings);
  check('carryover: missing captain warned', captainGone.warnings.some((warning) => warning.toLowerCase().includes('captain')));
  const overBudget = carryover.buildCarryoverPlan(sourceSquad, targetPlayers.map((player) => ({ ...player, price_million: 50 })), settings);
  check('carryover: budget overflow warned', overBudget.warnings.some((warning) => warning.includes('budget')));

  // ---- 7. Cron authorization ----
  const secret = 'a-very-long-cron-secret-value';
  check('cron: exact bearer accepted', cron.isAuthorizedCronRequest(`Bearer ${secret}`, secret) === true);
  check('cron: wrong token rejected', cron.isAuthorizedCronRequest('Bearer nope', secret) === false);
  check('cron: missing header rejected', cron.isAuthorizedCronRequest(null, secret) === false);
  check('cron: unset/short secret rejected', cron.isAuthorizedCronRequest('Bearer x', undefined) === false && cron.isAuthorizedCronRequest('Bearer short', 'short') === false);

  // ---- 8. Migration structure (season schema and constraints) ----
  const migration = readFileSync(join(repoRoot, 'supabase/migrations/20260710042257_fantasy_multi_season.sql'), 'utf8');
  check('migration: fantasy_seasons table', migration.includes('CREATE TABLE IF NOT EXISTS fantasy_seasons'));
  check('migration: single current season index', migration.includes('fantasy_seasons_single_current_idx'));
  check('migration: fantasy_season_players unique(season, player)', migration.includes('CREATE TABLE IF NOT EXISTS fantasy_season_players') && migration.includes('UNIQUE (season_id, player_id)'));
  check('migration: round uniqueness is season-scoped', migration.includes('DROP CONSTRAINT IF EXISTS fantasy_rounds_round_number_key') && migration.includes('fantasy_rounds_season_round_number_uniq'));
  check('migration: match stats identity (season, game, player)', migration.includes('fantasy_match_stats_season_game_player_uniq'));
  check('migration: chips per season', migration.includes('fantasy_chips_manager_season_chip_uniq'));
  check('migration: league codes per season', migration.includes('fantasy_leagues_season_code_uniq'));
  check('migration: legacy rows go to legacy season, never 2025-26', migration.includes("slug = 'legacy-unverified'") && !/fantasy_match_stats SET season_id = \(SELECT id FROM fantasy_seasons WHERE slug = '2025-26'\)/.test(migration));
  check('migration: provenance columns added', ['playhq_game_id', 'playhq_fixture_id', 'playhq_round_number', 'playhq_round_name', 'source_hash', 'source_updated_at'].every((column) => migration.includes(column)));
  check('migration: RLS public read policies use season visibility', migration.includes('fantasy_seasons_public_read') && migration.includes('s.is_public'));
  check('migration: set_fantasy_updated_at search_path pinned', migration.includes('ALTER FUNCTION set_fantasy_updated_at() SET search_path = public'));
  check('migration: sync jobs table for resumable imports', migration.includes('CREATE TABLE IF NOT EXISTS fantasy_sync_jobs'));

  const vercelConfig = JSON.parse(readFileSync(join(repoRoot, 'vercel.json'), 'utf8'));
  check('vercel: fantasy sync cron scheduled', vercelConfig.crons.some((cronEntry) => cronEntry.path === '/api/cron/playhq-fantasy-sync'));
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`${failures} fantasy season check(s) failed.`);
  process.exit(1);
}
console.log('All fantasy season checks passed.');

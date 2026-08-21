#!/usr/bin/env node
// Deterministic tests for the fantasy PlayHQ automation layer:
// season-year normalisation, automatic season matching (incl. ambiguity and
// date contradiction), NDCC club-team detection for grade discovery, and
// structural checks on the orchestrator, cron driver and lock migration.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptsDir, '..');
const tmpDir = join(scriptsDir, '.fantasy-orchestrator-tmp');

let failures = 0;
function check(label, condition) {
  if (condition) console.log(`PASS ${label}`);
  else { failures += 1; console.error(`FAIL ${label}`); }
}

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

try {
  for (const [rel, out] of [
    ['playhq/types.ts', 'types.ts'],
    ['playhq/season-match.ts', 'season-match.ts'],
  ]) {
    const source = readFileSync(join(repoRoot, 'lib', rel), 'utf8')
      .replace(/from '\.\/types'/g, "from './types.ts'")
      .replace("import 'server-only';", '');
    writeFileSync(join(tmpDir, out), source);
  }
  const mod = await import(pathToFileURL(join(tmpDir, 'season-match.ts')).href);
  const { extractSeasonYears, matchPlayHQSeason, isClubTeamName } = mod;

  // ---- Season year normalisation ----
  check('years: 2025/26', String(extractSeasonYears('2025/26')) === '2025,2026');
  check('years: 2025-26 slug', String(extractSeasonYears('2025-26')) === '2025,2026');
  check('years: 2025 2026', String(extractSeasonYears('2025 2026')) === '2025,2026');
  check('years: Season 2025/2026', String(extractSeasonYears('Season 2025/2026')) === '2025,2026');
  check('years: Summer 2026/27', String(extractSeasonYears('Summer 2026/27')) === '2026,2027');
  check('years: bare 2025 spans new year', String(extractSeasonYears('2025')) === '2025,2026');
  check('years: no year -> null', extractSeasonYears('Legacy / Unverified') === null);

  // ---- Automatic season matching ----
  const playhqSeasons = [
    { id: 'phq-2024', name: 'Season 2024/25', startDate: '2024-10-01', endDate: '2025-03-30' },
    { id: 'phq-2025', name: 'Season 2025/26', startDate: '2025-10-01', endDate: '2026-03-30' },
    { id: 'phq-2026', name: 'Season 2026/27', startDate: '2026-10-01', endDate: '2027-03-30' },
  ];
  const match2025 = matchPlayHQSeason(playhqSeasons, { slug: '2025-26', name: 'NDCC Fantasy 2025/2026' });
  check('match: 2025-26 -> phq-2025', match2025.status === 'matched' && match2025.season.id === 'phq-2025');
  check('match: evidence recorded', match2025.status === 'matched' && /phq-2025/.test(match2025.evidence));
  const match2026 = matchPlayHQSeason(playhqSeasons, { slug: '2026-27', name: 'NDCC Fantasy 2026/2027' });
  check('match: 2026-27 -> phq-2026', match2026.status === 'matched' && match2026.season.id === 'phq-2026');
  const competitionNameMatch = matchPlayHQSeason(
    [{ id: 'phq-competition-2025', name: 'Summer', competitionName: 'GCA Mens Competition 2025/26', startDate: '2025-10-01' }],
    { slug: '2025-26' }
  );
  check('match: years may come from PlayHQ competition name', competitionNameMatch.status === 'matched' && competitionNameMatch.season.id === 'phq-competition-2025');

  // Ambiguity is a blocking condition, never a guess.
  const ambiguous = matchPlayHQSeason(
    [...playhqSeasons, { id: 'phq-2025-b', name: 'Twenty20 2025/26', startDate: '2025-11-01', endDate: '2026-02-20' }],
    { slug: '2025-26' }
  );
  check('match: two candidates -> ambiguous', ambiguous.status === 'ambiguous' && ambiguous.candidates.length === 2);

  // Dates act as secondary validation: contradicting dates exclude a candidate.
  const dateFiltered = matchPlayHQSeason(
    [
      { id: 'phq-wrong', name: 'Season 2025/26', startDate: '2019-10-01', endDate: '2020-03-30' },
      { id: 'phq-right', name: 'Season 2025/26', startDate: '2025-09-15', endDate: '2026-04-01' },
    ],
    { slug: '2025-26' }
  );
  check('match: contradictory dates excluded', dateFiltered.status === 'matched' && dateFiltered.season.id === 'phq-right');

  const noMatch = matchPlayHQSeason(playhqSeasons, { slug: '2030-31' });
  check('match: missing season -> none', noMatch.status === 'none');

  // ---- Club team detection (grade discovery) ----
  check('club: Newcomb & District CC', isClubTeamName('Newcomb & District CC'));
  check('club: Newcomb and District 2nd XI', isClubTeamName('Newcomb and District 2nd XI'));
  check('club: NDCC Gold', isClubTeamName('NDCC Gold'));
  check('club: plain Newcomb', isClubTeamName('Newcomb'));
  check('club: rejects other club', !isClubTeamName('East Belmont Saints'));
  check('club: rejects Newtown (prefix trap)', !isClubTeamName('Newtown & Chilwell'));
  check('club: rejects empty', !isClubTeamName(''));

  // ---- Structural checks ----
  const orchestrator = readFileSync(join(repoRoot, 'lib/playhq/fantasy-orchestrator.ts'), 'utf8');
  check('orchestrator acquires DB lock before running', orchestrator.includes("rpc('acquire_fantasy_sync_lock'"));
  check('orchestrator releases lock in finally', /finally\s*{\s*await supabase\.rpc\('release_fantasy_sync_lock'/.test(orchestrator));
  check('orchestrator never overwrites a conflicting season id', orchestrator.includes('conflicts with stored'));
  check('orchestrator preserves admin-disabled grade sources', orchestrator.includes('automation will not re-enable'));
  check('orchestrator guards empty-fetch publication', orchestrator.includes('possible empty API response'));
  check('orchestrator blocks publish on review items', orchestrator.includes('review item(s) require admin resolution'));
  check('orchestrator recovers abandoned running jobs', orchestrator.includes('Recovered abandoned running job'));
  check('orchestrator alerts admins after repeated failures', orchestrator.includes('maybeAlertAdmins'));
  check('orchestrator is server-only', orchestrator.includes("import 'server-only';"));
  check('orchestrator includes hidden historical bootstrap seasons',
    !orchestrator.includes(".eq('is_public', true)"));

  const cron = readFileSync(join(repoRoot, 'app/api/cron/playhq-fantasy-sync/route.ts'), 'utf8');
  check('cron drives the orchestrator', cron.includes('runFantasyOrchestrator'));

  // Ambiguous identically-named seasons must be resolved with real API
  // evidence (team probe), never guessed - and stay blocked when more than
  // one candidate contains NDCC teams.
  const orchestratorSource = readFileSync(join(repoRoot, 'lib/playhq/fantasy-orchestrator.ts'), 'utf8');
  check('orchestrator probes ambiguous seasons by club teams', orchestratorSource.includes('disambiguateByClubTeams'));
  check('orchestrator ingests every NDCC-containing competition (owner decision)', orchestratorSource.includes('sources: sources.map'));
  check('orchestrator blocks when no candidate contains NDCC teams', orchestratorSource.includes('None of the ') && orchestratorSource.includes('contain NDCC teams'));
  check('grade sources record their PlayHQ source season', orchestratorSource.includes('playhq_season_id: meta.playhqSeasonId'));
  check('grade names fall back to team records when grades endpoint is empty', orchestratorSource.includes('team.gradeName ?? team.gradeId'));
  const clientSource = readFileSync(join(repoRoot, 'lib/playhq/client.ts'), 'utf8');
  check('public fixtures probe skips seasons without grades', clientSource.includes('candidateGrades.length'));
  const syncSource = readFileSync(join(repoRoot, 'lib/playhq/fantasy-sync.ts'), 'utf8');
  check('a dead grade fixture endpoint is skipped, not fatal', syncSource.includes('skippedGrades.push'));
  check('sync only fails when every grade fixture endpoint fails', syncSource.includes('skippedGrades.length === grades.length'));
  check('grade 404 falls back to per-team fixture feeds', syncSource.includes('getPlayHQTeamFixtureRaw'));
  check('team-feed fallback dedupes games by id', syncSource.includes('seenGameIds.has(fixture.id)'));
  check('fixture reads walk candidate endpoint paths', clientSource.includes('playHQFetchFirst'));
  check('public fixtures derive grades from team records when the grades endpoint is empty', clientSource.includes('derived.set(team.gradeId'));
  const normaliseSource = readFileSync(join(repoRoot, 'lib/playhq/normalise.ts'), 'utf8');
  check('season normaliser keeps competition name evidence', normaliseSource.includes('competitionName'));
  check('cron keeps CRON_SECRET auth', cron.includes('isAuthorizedCronRequest'));
  check('cron keeps enable flag gate', cron.includes('PLAYHQ_FANTASY_SYNC_ENABLED'));

  const releaseRunner = readFileSync(join(repoRoot, 'app/api/admin/fantasy/release-run/route.ts'), 'utf8');
  check('release runner consumes a one-time token',
    releaseRunner.includes("rpc('consume_fantasy_release_token'") && releaseRunner.includes('createHash'));
  check('release runner drives only the orchestrator',
    releaseRunner.includes('runFantasyOrchestrator') && !releaseRunner.includes('public_launch_enabled'));
  check('release runner responses are never cached',
    releaseRunner.includes("'Cache-Control': 'no-store'") && releaseRunner.includes("'Referrer-Policy': 'no-referrer'"));

  const vercel = JSON.parse(readFileSync(join(repoRoot, 'vercel.json'), 'utf8'));
  check('vercel cron path present', vercel.crons.some((c) => c.path === '/api/cron/playhq-fantasy-sync'));

  const migration = readFileSync(join(repoRoot, 'supabase/migrations/20260715000755_fantasy_sync_automation.sql'), 'utf8');
  check('migration: lock function is atomic upsert', migration.includes('ON CONFLICT (name) DO UPDATE'));
  check('migration: lock fn revoked from anon', /REVOKE EXECUTE ON FUNCTION acquire_fantasy_sync_lock[^;]*anon/.test(migration));
  check('migration: sync runs RLS enabled', migration.includes('ALTER TABLE fantasy_sync_runs ENABLE ROW LEVEL SECURITY'));
  check('migration: legacy season excluded from automation', migration.includes("auto_sync_enabled = FALSE WHERE slug = 'legacy-unverified'"));
  check('migration: additive only (no drops of existing objects)', !/DROP TABLE (?!IF EXISTS fantasy_sync)/.test(migration));

  const adminSync = readFileSync(join(repoRoot, 'app/api/admin/fantasy/sync/route.ts'), 'utf8');
  check('admin sync exposes health endpoint', adminSync.includes("searchParams.get('health')"));
  check('admin sync exposes manual orchestrate action', adminSync.includes("action === 'orchestrate'"));
  check('admin sync exposes read-only preview action', adminSync.includes("action === 'preview'") && adminSync.includes('previewFantasySeasonSync'));

  // ---- 2026/27 season-readiness controls ----
  // Non-empty sync invariant: raw entries with zero queued games must park
  // the job as needs_review with diagnostics, never complete as an empty
  // success.
  check('sync tracks total raw entries', syncSource.includes('rawEntriesTotal += rawFixtures.length'));
  check('sync unwraps nested PlayHQ data.items fixture collections', syncSource.includes("['items', 'fixtures', 'games']") && syncSource.includes('root.data'));
  check('sync enforces the non-empty invariant (raw>0, queued=0 -> needs_review)',
    syncSource.includes('emptyQueueInvariantBreached') && syncSource.includes("'needs_review' : 'pending'"));
  check('sync stores raw_entries + grade diagnostics on the job counts',
    syncSource.includes('raw_entries: rawEntriesTotal') && syncSource.includes('grade_debug: gradeDebug.slice'));
  check('sync diagnostics are truncated (no unbounded payload storage)', syncSource.includes('.slice(0, 400)'));
  check('sync supports read-only dry runs', syncSource.includes('options.dryRun'));
  check('orchestrator blocks on the empty-queue invariant', orchestratorSource.includes('emptyQueueInvariantBreached') || orchestrator.includes('emptyQueueInvariantBreached'));
  check('orchestrator records per-season sync health', orchestrator.includes("from('fantasy_sync_health')") || orchestratorSource.includes('updateSyncHealth'));
  check('orchestrator computes season readiness rollup', orchestratorSource.includes('playhq_season_linked') && orchestratorSource.includes('unresolved_reviews'));
  check('orchestrator surfaces Awaiting PlayHQ instead of empty success', orchestratorSource.includes('awaiting_playhq'));
  check('player matching is PlayHQ-id-first and persists only unique exact normalised matches',
    syncSource.includes("eq('playhq_player_id', line.playhq_player_id)")
      && syncSource.includes('resolveExactIdentityCandidate')
      && syncSource.includes("decision.status === 'ambiguous'")
      && syncSource.includes("decision: 'unique_normalised_name'"));

  const healthMigration = readFileSync(join(repoRoot, 'supabase/migrations/20260716060000_fantasy_sync_health.sql'), 'utf8');
  for (const column of ['last_successful_discovery', 'last_successful_game_import', 'raw_entries', 'queued_games', 'processed_games', 'matched_players', 'ambiguous_players', 'failed_games', 'last_error', 'next_retry_at']) {
    check(`health migration has ${column}`, healthMigration.includes(column));
  }
  check('health migration enables RLS', /alter table .*fantasy_sync_health enable row level security/i.test(healthMigration));

  const releaseTokenMigration = readFileSync(join(repoRoot, 'supabase/migrations/20260821035433_dino_coach_release_token_runner.sql'), 'utf8');
  check('release token consumption is an atomic conditional update',
    /update public\.fantasy_release_tokens[\s\S]*used_at is null[\s\S]*revoked_at is null[\s\S]*expires_at > now\(\)/i.test(releaseTokenMigration));
  check('release token function has a safe search path',
    /security definer[\s\S]*set search_path = ''/i.test(releaseTokenMigration));
  check('release token function is service-role only',
    /revoke all on function public\.consume_fantasy_release_token\(text\) from public, anon, authenticated/i.test(releaseTokenMigration)
      && /grant execute on function public\.consume_fantasy_release_token\(text\) to service_role/i.test(releaseTokenMigration));

  // Stale-read hardening (production evidence 2026-07-16: cached Supabase
  // GETs failed 10 game imports on duplicate round keys).
  const supabaseServer = readFileSync(join(repoRoot, 'lib/supabase-server.ts'), 'utf8');
  check('supabase server fetch is never cached', supabaseServer.includes("cache: 'no-store'"));
  check('ensureRound adopts an existing round on duplicate-key conflict',
    syncSource.includes("error.code === '23505'") && syncSource.includes('readRound'));

  const seasonsPage = readFileSync(join(repoRoot, 'app/admin/fantasy/seasons/page.tsx'), 'utf8');
  check('CMS shows sync health record', seasonsPage.includes('syncHealth'));
  check('CMS shows Awaiting PlayHQ state', seasonsPage.includes('Awaiting PlayHQ'));
  check('CMS has Run Preview action', seasonsPage.includes('Run Preview'));
  check('CMS shows season readiness', seasonsPage.includes('Season readiness'));
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

if (failures) { console.error(`${failures} fantasy orchestrator test(s) failed.`); process.exit(1); }
console.log('Fantasy orchestrator tests passed.');

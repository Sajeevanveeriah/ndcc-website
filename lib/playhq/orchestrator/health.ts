/* eslint-disable @typescript-eslint/no-explicit-any */
// Admin CMS health snapshot and sync preview for the fantasy PlayHQ orchestrator.
// Split out of lib/playhq/fantasy-orchestrator.ts (which re-exports the public API).
import 'server-only';
import { createServerClient } from '@/lib/supabase-server';
import { getPlayHQGrades, getPlayHQSeasons, getPlayHQTeams } from '../client';
import { getPlayHQConfig, isFantasySyncEnabled } from '../config';
import { isClubTeamName, matchPlayHQSeason } from '../season-match';
import { startFantasySyncJob } from '../fantasy-sync';
import { disambiguateByClubTeams } from './discovery';

/** Health snapshot for the admin CMS: per-season pipeline state, current job,
 *  batches, mappings, exceptions and recent orchestrator activity. */
export async function getFantasySyncHealth() {
  const supabase = createServerClient();
  const [{ data: seasons }, { data: runs }] = await Promise.all([
    supabase
      .from('fantasy_seasons')
      .select('id, name, slug, status, is_current, is_public, playhq_season_id, playhq_linked_at, playhq_discovery, auto_sync_enabled, sync_exception, last_playhq_sync_at')
      .order('slug'),
    supabase
      .from('fantasy_sync_runs')
      .select('id, invoked_by, season_id, stage, status, detail, error, created_at')
      .order('created_at', { ascending: false })
      .limit(40),
  ]);

  const seasonIds = (seasons ?? []).map((season: { id: string }) => season.id);
  // Health table may predate its migration; tolerate absence.
  const healthRows = await Promise.resolve(
    supabase
      .from('fantasy_sync_health')
      .select('season_id, last_successful_discovery, last_successful_game_import, raw_entries, queued_games, processed_games, matched_players, ambiguous_players, failed_games, last_error, next_retry_at, updated_at')
  )
    .then((res: { data: unknown[] | null }) => res.data ?? [])
    .catch(() => []);
  const [{ data: jobs }, { data: grades }, { data: batches }] = await Promise.all([
    supabase
      .from('fantasy_sync_jobs')
      .select('id, season_id, status, total_games, processed_games, successful_games, failed_games, counts, review_items, error_summary, created_at, completed_at, updated_at, import_batch_id')
      .in('season_id', seasonIds.length ? seasonIds : ['00000000-0000-0000-0000-000000000000'])
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('fantasy_season_grade_sources')
      .select('id, season_id, playhq_grade_id, grade_name, enabled, team_filter')
      .in('season_id', seasonIds.length ? seasonIds : ['00000000-0000-0000-0000-000000000000']),
    supabase
      .from('fantasy_import_batches')
      .select('id, season_id, source, status, created_at, notes')
      .eq('source', 'playhq-api')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  // Season-readiness rollup: is each season actually ready for play?
  const readiness: Record<string, unknown>[] = [];
  for (const season of (seasons ?? []) as Array<{ id: string; slug: string; playhq_season_id: string | null }>) {
    const seasonJobs = (jobs ?? []).filter((job: { season_id: string }) => job.season_id === season.id);
    const latestJob = seasonJobs[0] ?? null;
    const enabledGrades = (grades ?? []).filter((grade: { season_id: string; enabled: boolean }) => grade.season_id === season.id && grade.enabled);

    const [{ count: playerCount }, { count: linkedPlayerCount }, { count: publishedStatCount }] = await Promise.all([
      supabase.from('fantasy_season_players').select('id', { count: 'exact', head: true }).eq('season_id', season.id),
      supabase.from('fantasy_season_players').select('id', { count: 'exact', head: true }).eq('season_id', season.id).not('playhq_player_id', 'is', null),
      supabase
        .from('fantasy_match_stats')
        .select('id, fantasy_import_batches!inner(status,source)', { count: 'exact', head: true })
        .eq('season_id', season.id)
        .eq('fantasy_import_batches.status', 'published')
        .eq('fantasy_import_batches.source', 'playhq-api'),
    ]);

    const reviewCount = seasonJobs.reduce((sum: number, job: { status: string; review_items?: unknown[] }) => (
      sum + (job.status === 'needs_review' && Array.isArray(job.review_items) ? job.review_items.length : 0)
    ), 0);

    readiness.push({
      season_id: season.id,
      slug: season.slug,
      playhq_season_linked: Boolean(season.playhq_season_id),
      awaiting_playhq: !season.playhq_season_id,
      grades_mapped: enabledGrades.length,
      players_total: playerCount ?? 0,
      players_linked: linkedPlayerCount ?? 0,
      fixtures_imported: Number(latestJob?.total_games ?? 0) > 0,
      fixtures_discovered: Number(latestJob?.counts?.club_fixtures ?? 0),
      awaiting_results: latestJob?.status === 'completed' && Number(latestJob?.counts?.awaiting_results ?? 0) > 0 && Number(latestJob?.total_games ?? 0) === 0,
      completed_match_stats_imported: (publishedStatCount ?? 0) > 0,
      published_stat_rows: publishedStatCount ?? 0,
      unresolved_reviews: reviewCount,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    syncEnabled: isFantasySyncEnabled(),
    playhqConfigured: getPlayHQConfig().configured,
    seasons: seasons ?? [],
    jobs: jobs ?? [],
    gradeSources: grades ?? [],
    batches: batches ?? [],
    recentRuns: runs ?? [],
    syncHealth: healthRows,
    readiness,
  };
}

/** Read-only preview for the CMS "Run Preview" action: performs discovery
 *  and queue building and reports the proposed changes WITHOUT writing
 *  anything — no season link, no grade rows, no batch, no job. */
export async function previewFantasySeasonSync(seasonId: string) {
  const supabase = createServerClient();
  const { data: season, error } = await supabase
    .from('fantasy_seasons')
    .select('id, name, slug, playhq_season_id, playhq_discovery')
    .eq('id', seasonId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!season) throw new Error('Fantasy season not found.');

  const preview: Record<string, unknown> = {
    season: season.slug,
    linked: Boolean(season.playhq_season_id),
    awaiting_playhq: false,
    generatedAt: new Date().toISOString(),
  };

  if (!season.playhq_season_id) {
    const playhqSeasons = await getPlayHQSeasons();
    const match = matchPlayHQSeason(playhqSeasons, { slug: season.slug, name: season.name });
    if (match.status === 'matched') {
      preview.proposed_link = { playhq_season_id: match.season.id, name: match.season.name, evidence: match.evidence };
    } else if (match.status === 'ambiguous') {
      const { probed, survivors } = await disambiguateByClubTeams(match.candidates);
      preview.proposed_link = survivors.length
        ? { playhq_season_id: survivors[0].id, name: survivors[0].name, candidates: survivors, evidence: match.evidence }
        : null;
      preview.awaiting_playhq = survivors.length === 0;
      preview.probe = probed;
    } else {
      preview.awaiting_playhq = true;
      preview.evidence = match.evidence;
    }
    return preview;
  }

  // Linked season: propose missing grades (read-only) and dry-run the queue.
  const sourceIds = Array.from(new Set([
    season.playhq_season_id as string,
    ...(((season.playhq_discovery as { sources?: Array<{ id: string }> } | null)?.sources) ?? []).map((source) => source.id),
  ].filter(Boolean)));
  const discovered = new Map<string, { name: string; teams: string[] }>();
  for (const sourceId of sourceIds.slice(0, 8)) {
    const [teams, gradeList] = await Promise.all([
      getPlayHQTeams(sourceId).catch(() => []),
      getPlayHQGrades(sourceId).catch(() => []),
    ]);
    const gradeNames = new Map(gradeList.map((grade: { id: string; name: string }) => [grade.id, grade.name]));
    for (const team of teams as Array<{ name: string; gradeId?: string | null; gradeName?: string | null }>) {
      if (!team.gradeId || !isClubTeamName(team.name)) continue;
      const entry = discovered.get(team.gradeId) ?? { name: gradeNames.get(team.gradeId) ?? team.gradeName ?? team.gradeId, teams: [] };
      entry.teams.push(team.name);
      discovered.set(team.gradeId, entry);
    }
  }
  const { data: existingGrades } = await supabase
    .from('fantasy_season_grade_sources')
    .select('playhq_grade_id, grade_name, enabled')
    .eq('season_id', season.id);
  const existingIds = new Set((existingGrades ?? []).map((row: { playhq_grade_id: string }) => row.playhq_grade_id));
  preview.grades = {
    existing: existingGrades ?? [],
    proposed_new: Array.from(discovered.entries())
      .filter(([gradeId]) => !existingIds.has(gradeId))
      .map(([gradeId, meta]) => ({ grade_id: gradeId, grade_name: meta.name, matched_teams: meta.teams })),
  };

  if ((existingGrades ?? []).some((grade: { enabled: boolean }) => grade.enabled)) {
    const dry = await startFantasySyncJob({ seasonId: season.id, dryRun: true });
    preview.queue = {
      queued_games: dry.queued,
      raw_entries: dry.rawEntries,
      review_items: dry.reviewItems,
      skipped_grades: dry.skippedGrades,
      grade_debug: dry.gradeDebug,
      empty_queue_invariant_breached: dry.emptyQueueInvariantBreached,
      sample: dry.queuePreview,
    };
  } else {
    preview.queue = { note: 'No enabled grade sources yet; the queue preview runs once grades are mapped.' };
  }
  return preview;
}

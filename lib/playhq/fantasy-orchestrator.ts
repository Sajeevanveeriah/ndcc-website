/* eslint-disable @typescript-eslint/no-explicit-any */
// Fantasy PlayHQ orchestrator: the autonomous driver that makes ingestion
// fully automatic. Each run (cron or admin-triggered) advances every eligible
// season through the state machine, within a bounded time budget:
//
//   discover season -> link season -> discover grades -> map NDCC grades
//   -> create or resume job -> process bounded batches -> validate
//   -> auto-publish safe batches -> record health -> alert on repeated failure
//
// Idempotent by construction: season linking is write-once (conflicts become
// blocking exceptions, never silent overwrites), grade mapping only inserts
// missing rows (admin overrides preserved), job processing reuses the
// existing resumable job machinery, stat upserts are source_hash keyed, and
// publication only promotes a fully-clean completed job's batch.
import 'server-only';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';
import { sendEmail, getContactEmailRecipients } from '@/lib/email';
import { getPlayHQGrades, getPlayHQSeasons, getPlayHQTeams } from './client';
import { getPlayHQConfig, isFantasySyncEnabled } from './config';
import { isClubTeamName, matchPlayHQSeason } from './season-match';
import {
  DEFAULT_SYNC_BATCH_SIZE,
  processFantasySyncBatch,
  startFantasySyncJob,
} from './fantasy-sync';

const LOCK_NAME = 'playhq-fantasy-orchestrator';
const LOCK_TTL_SECONDS = 120;
const DEFAULT_TIME_BUDGET_MS = 45_000;
// A job stuck in `running` whose row has not been touched for this long is
// considered abandoned (the serverless invocation died) and is resumed.
const ABANDONED_RUNNING_MS = 15 * 60 * 1000;
// Consecutive failed orchestrator runs for a season before an alert email.
const ALERT_AFTER_FAILURES = 3;
const ALERT_DEDUPE_MS = 24 * 60 * 60 * 1000;

type RunLog = {
  seasonSlug: string | null;
  stage: string;
  status: 'ok' | 'skipped' | 'error' | 'blocked';
  detail?: Record<string, unknown>;
  error?: string;
};

export type OrchestratorResult = {
  ran: boolean;
  reason?: string;
  logs: RunLog[];
};

type SeasonRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  is_current: boolean;
  is_public: boolean;
  playhq_season_id: string | null;
  playhq_discovery: { sources?: Array<{ id: string; name?: string; competitionName?: string | null; clubTeams?: string[] }> } | null;
  auto_sync_enabled: boolean;
  sync_exception: string | null;
  last_playhq_sync_at: string | null;
};

async function recordRun(supabase: any, invokedBy: string, seasonId: string | null, log: RunLog) {
  await supabase.from('fantasy_sync_runs').insert({
    invoked_by: invokedBy,
    season_id: seasonId,
    stage: log.stage,
    status: log.status,
    detail: log.detail ?? null,
    error: log.error ?? null,
  });
}

async function setSeasonException(supabase: any, seasonId: string, message: string | null) {
  await supabase.from('fantasy_seasons').update({ sync_exception: message }).eq('id', seasonId);
}

/** Next scheduled cron firing (daily 16:30 UTC per vercel.json). */
function nextScheduledRetry(): string {
  const next = new Date();
  next.setUTCHours(16, 30, 0, 0);
  if (next.getTime() <= Date.now()) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

/** Upsert the per-season sync health record. Best-effort: health must never
 *  break the pipeline itself (e.g. before its migration is applied). */
async function updateSyncHealth(supabase: any, seasonId: string, patch: Record<string, unknown>) {
  try {
    await supabase
      .from('fantasy_sync_health')
      .upsert({ season_id: seasonId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'season_id' });
  } catch {
    /* table may not exist yet */
  }
}

/** When several identically-named seasons match the year pair (organisations
 *  are registered once per competition), probe each candidate's team list and
 *  keep only seasons that actually contain NDCC teams. Deterministic evidence
 *  from the official API — never a guess. */
async function disambiguateByClubTeams(candidates: Array<{ id: string; name: string; competitionName?: string | null }>) {
  const probed: Array<{ id: string; name: string; competitionName: string | null; clubTeams: string[]; teamsSeen: number }> = [];
  for (const candidate of candidates.slice(0, 8)) {
    let teams: Array<{ name: string }> = [];
    try {
      teams = await getPlayHQTeams(candidate.id);
    } catch {
      // A candidate whose teams endpoint fails cannot be verified; keep it
      // out of the survivor set but record the probe.
    }
    const clubTeams = teams.filter((team) => isClubTeamName(team.name)).map((team) => team.name);
    probed.push({ id: candidate.id, name: candidate.name, competitionName: candidate.competitionName ?? null, clubTeams, teamsSeen: teams.length });
  }
  return { probed, survivors: probed.filter((candidate) => candidate.clubTeams.length > 0) };
}

/** Link a fantasy season to its PlayHQ season by normalised years + dates.
 *  Never overwrites a different existing id — that becomes a blocking
 *  exception for an admin to resolve. */
async function discoverAndLinkSeason(supabase: any, season: SeasonRow): Promise<RunLog> {
  const playhqSeasons = await getPlayHQSeasons();
  if (!playhqSeasons.length) {
    return { seasonSlug: season.slug, stage: 'discover_season', status: 'error', error: 'PlayHQ returned no seasons for the organisation (kept previous state).' };
  }
  let match = matchPlayHQSeason(playhqSeasons, { slug: season.slug, name: season.name });
  // Every NDCC-containing competition counts for fantasy (owner decision,
  // 2026-07-15): Mens, Womens, T20 and Juniors are all ingested. The primary
  // link is the competition with the most NDCC teams (deterministic
  // tiebreak); every surviving competition is recorded as a grade source
  // discovery target.
  let sources: Array<{ id: string; name: string; competitionName: string | null; clubTeams: string[] }> = [];
  if (match.status === 'ambiguous') {
    const { probed, survivors } = await disambiguateByClubTeams(match.candidates);
    if (survivors.length === 0) {
      const probeEvidence = probed
        .map((candidate) => `${candidate.name}${candidate.competitionName ? ` / ${candidate.competitionName}` : ''} (${candidate.id}): 0 NDCC team(s) of ${candidate.teamsSeen}`)
        .join('; ');
      return {
        seasonSlug: season.slug,
        stage: 'discover_season',
        status: 'blocked',
        detail: { evidence: match.evidence, probe: probeEvidence },
        error: `None of the ${probed.length} candidate seasons contain NDCC teams. Probe: ${probeEvidence}.`,
      };
    }
    const ranked = [...survivors].sort((a, b) => b.clubTeams.length - a.clubTeams.length || (a.competitionName ?? a.name).localeCompare(b.competitionName ?? b.name) || a.id.localeCompare(b.id));
    sources = ranked;
    const primary = ranked[0];
    match = {
      status: 'matched',
      season: match.candidates.find((candidate) => candidate.id === primary.id)!,
      evidence: `${match.evidence} Team probe kept ${ranked.length} NDCC-containing competition(s): ${ranked
        .map((candidate) => `${candidate.competitionName ?? candidate.name} (${candidate.clubTeams.length} NDCC teams)`)
        .join('; ')}. Primary link: ${primary.competitionName ?? primary.name} (${primary.id}).`,
    };
  }
  if (match.status !== 'matched') {
    return {
      seasonSlug: season.slug,
      stage: 'discover_season',
      status: 'skipped',
      detail: { evidence: match.evidence },
    };
  }
  if (!sources.length) {
    sources = [{ id: match.season.id, name: match.season.name, competitionName: match.season.competitionName ?? null, clubTeams: [] }];
  }
  if (season.playhq_season_id && season.playhq_season_id !== match.season.id) {
    const message = `Discovered PlayHQ season ${match.season.id} conflicts with stored ${season.playhq_season_id}. Resolve manually.`;
    await setSeasonException(supabase, season.id, message);
    return { seasonSlug: season.slug, stage: 'link_season', status: 'blocked', error: message };
  }
  const { error } = await supabase
    .from('fantasy_seasons')
    .update({
      playhq_season_id: match.season.id,
      playhq_linked_at: new Date().toISOString(),
      playhq_discovery: {
        evidence: match.evidence,
        playhq_name: match.season.name,
        start_date: match.season.startDate ?? null,
        end_date: match.season.endDate ?? null,
        discovered_at: new Date().toISOString(),
        sources: sources.map((source) => ({ id: source.id, name: source.name, competitionName: source.competitionName, clubTeams: source.clubTeams })),
      },
      sync_exception: null,
    })
    .eq('id', season.id);
  if (error) return { seasonSlug: season.slug, stage: 'link_season', status: 'error', error: error.message };
  season.playhq_season_id = match.season.id;
  season.playhq_discovery = { sources };
  return { seasonSlug: season.slug, stage: 'link_season', status: 'ok', detail: { playhq_season_id: match.season.id, source_count: sources.length, evidence: match.evidence } };
}

/** Discover the grades containing NDCC teams across every discovered PlayHQ
 *  source season and persist any missing grade sources. Existing rows
 *  (including admin-disabled ones) are never changed. Grade names come from
 *  the grades endpoint when it answers and fall back to the grade name
 *  carried on the team records (some club-scoped seasons return teams but an
 *  empty grades collection). */
async function discoverAndMapGrades(supabase: any, season: SeasonRow): Promise<RunLog> {
  const sourceIds = Array.from(new Set([
    season.playhq_season_id as string,
    ...(season.playhq_discovery?.sources ?? []).map((source) => source.id),
  ].filter(Boolean)));

  const clubGrades = new Map<string, { name: string; playhqSeasonId: string; teams: string[] }>();
  const excluded: string[] = [];
  let teamsSeen = 0;
  for (const sourceId of sourceIds.slice(0, 8)) {
    const [teams, grades] = await Promise.all([
      getPlayHQTeams(sourceId).catch(() => []),
      getPlayHQGrades(sourceId).catch(() => []),
    ]);
    teamsSeen += teams.length;
    const gradeNames = new Map(grades.map((grade: { id: string; name: string }) => [grade.id, grade.name]));
    for (const team of teams as Array<{ name: string; gradeId?: string | null; gradeName?: string | null }>) {
      if (!team.gradeId) continue;
      if (!isClubTeamName(team.name)) {
        excluded.push(team.name);
        continue;
      }
      const entry = clubGrades.get(team.gradeId) ?? {
        name: gradeNames.get(team.gradeId) ?? team.gradeName ?? team.gradeId,
        playhqSeasonId: sourceId,
        teams: [],
      };
      entry.teams.push(team.name);
      clubGrades.set(team.gradeId, entry);
    }
  }
  if (clubGrades.size === 0) {
    return {
      seasonSlug: season.slug,
      stage: 'discover_grades',
      status: 'skipped',
      detail: { reason: 'No NDCC teams found in any discovered PlayHQ source season.', teams_seen: teamsSeen, sources: sourceIds },
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from('fantasy_season_grade_sources')
    .select('playhq_grade_id')
    .eq('season_id', season.id);
  if (existingError) return { seasonSlug: season.slug, stage: 'discover_grades', status: 'error', error: existingError.message };
  const existingIds = new Set((existing ?? []).map((row: { playhq_grade_id: string }) => row.playhq_grade_id));

  const inserts = Array.from(clubGrades.entries())
    .filter(([gradeId]) => !existingIds.has(gradeId))
    .map(([gradeId, meta]) => ({
      season_id: season.id,
      playhq_grade_id: gradeId,
      grade_name: meta.name,
      playhq_season_id: meta.playhqSeasonId,
      enabled: true,
      team_filter: 'newcomb',
    }));
  if (inserts.length) {
    const { error } = await supabase.from('fantasy_season_grade_sources').insert(inserts);
    if (error) return { seasonSlug: season.slug, stage: 'map_grades', status: 'error', error: error.message };
  }
  return {
    seasonSlug: season.slug,
    stage: 'map_grades',
    status: 'ok',
    detail: {
      discovered: clubGrades.size,
      inserted: inserts.length,
      preserved_existing: existingIds.size,
      source_seasons: sourceIds.length,
      grades: Array.from(clubGrades.entries()).map(([gradeId, meta]) => ({
        grade_id: gradeId,
        grade_name: meta.name,
        playhq_season_id: meta.playhqSeasonId,
        matched_teams: meta.teams,
      })),
      excluded_team_sample: excluded.slice(0, 8),
    },
  };
}

/** Validate a finished job's draft batch and publish it when every blocking
 *  gate passes. Blocking issues keep the previous published state untouched. */
async function validateAndPublish(supabase: any, season: SeasonRow, job: any): Promise<RunLog> {
  const blockers: string[] = [];
  if (job.status !== 'completed') blockers.push(`Job finished as ${job.status}, not completed.`);
  if (Number(job.failed_games || 0) > 0) blockers.push(`${job.failed_games} game(s) failed to import.`);
  const reviewItems = Array.isArray(job.review_items) ? job.review_items : [];
  if (reviewItems.length > 0) blockers.push(`${reviewItems.length} review item(s) require admin resolution.`);
  if (Number(job.processed_games || 0) < Number(job.total_games || 0)) {
    blockers.push(`Only ${job.processed_games}/${job.total_games} discovered games were processed.`);
  }

  const { data: batch, error: batchError } = await supabase
    .from('fantasy_import_batches')
    .select('id, status')
    .eq('id', job.import_batch_id)
    .maybeSingle();
  if (batchError || !batch) {
    return { seasonSlug: season.slug, stage: 'validate_batch', status: 'error', error: batchError?.message || 'Import batch missing for completed job.' };
  }
  if (batch.status === 'published') {
    return { seasonSlug: season.slug, stage: 'publish_batch', status: 'skipped', detail: { reason: 'Batch already published.', batch_id: batch.id } };
  }
  if (batch.status === 'rejected') {
    return { seasonSlug: season.slug, stage: 'publish_batch', status: 'skipped', detail: { reason: 'Batch was rejected by an admin.', batch_id: batch.id } };
  }

  // Row-level integrity gates on the imported rows themselves.
  const { count: rowCount, error: rowsError } = await supabase
    .from('fantasy_match_stats')
    .select('id', { count: 'exact', head: true })
    .eq('import_batch_id', batch.id);
  if (rowsError) return { seasonSlug: season.slug, stage: 'validate_batch', status: 'error', error: rowsError.message };

  const { count: invalidCount, error: invalidError } = await supabase
    .from('fantasy_match_stats')
    .select('id', { count: 'exact', head: true })
    .eq('import_batch_id', batch.id)
    .or('runs.lt.0,wickets.lt.0,maidens.lt.0,catches.lt.0,runouts.lt.0,stumpings.lt.0,ducks.lt.0,player_id.is.null,round_id.is.null');
  if (invalidError) return { seasonSlug: season.slug, stage: 'validate_batch', status: 'error', error: invalidError.message };
  if ((invalidCount ?? 0) > 0) blockers.push(`${invalidCount} imported row(s) failed field validation.`);

  const totalGames = Number(job.total_games || 0);
  const skipped = Number(job.counts?.skipped ?? 0);
  if (totalGames > 0 && (rowCount ?? 0) === 0 && skipped === 0) {
    blockers.push('Batch is empty although completed games were discovered (possible empty API response).');
  }

  if (blockers.length) {
    const message = blockers.join(' ');
    await setSeasonException(supabase, season.id, message);
    return { seasonSlug: season.slug, stage: 'validate_batch', status: 'blocked', error: message, detail: { batch_id: batch.id, rows: rowCount ?? 0 } };
  }

  if ((rowCount ?? 0) === 0) {
    // Everything already matches published data — close the empty batch
    // without publishing a no-op container.
    await supabase.from('fantasy_import_batches').update({ status: 'rejected', notes: 'Auto-closed: no changes versus existing published data.' }).eq('id', batch.id);
    await setSeasonException(supabase, season.id, null);
    return { seasonSlug: season.slug, stage: 'publish_batch', status: 'ok', detail: { batch_id: batch.id, published: false, reason: 'No changes to publish; existing published data already current.' } };
  }

  const { error: publishError } = await supabase
    .from('fantasy_import_batches')
    .update({ status: 'published' })
    .eq('id', batch.id)
    .eq('status', batch.status);
  if (publishError) return { seasonSlug: season.slug, stage: 'publish_batch', status: 'error', error: publishError.message };

  await supabase.from('fantasy_seasons').update({ last_playhq_sync_at: new Date().toISOString(), sync_exception: null }).eq('id', season.id);
  try {
    revalidatePath('/fantasy/leaderboard');
    revalidatePath('/fantasy');
    revalidatePath('/fantasy/players');
  } catch { /* best-effort cache refresh */ }
  return {
    seasonSlug: season.slug,
    stage: 'publish_batch',
    status: 'ok',
    detail: {
      batch_id: batch.id,
      published: true,
      rows: rowCount ?? 0,
      games: totalGames,
      counts: job.counts ?? null,
    },
  };
}

/** Send a deduplicated admin alert after repeated failures for a season. */
async function maybeAlertAdmins(supabase: any, invokedBy: string, season: SeasonRow, latestError: string) {
  const { data: recent } = await supabase
    .from('fantasy_sync_runs')
    .select('status, stage, created_at')
    .eq('season_id', season.id)
    .neq('stage', 'alert')
    .order('created_at', { ascending: false })
    .limit(ALERT_AFTER_FAILURES);
  const failures = (recent ?? []).filter((run: { status: string }) => run.status === 'error' || run.status === 'blocked');
  if (failures.length < ALERT_AFTER_FAILURES) return;

  const { data: lastAlert } = await supabase
    .from('fantasy_sync_runs')
    .select('created_at')
    .eq('season_id', season.id)
    .eq('stage', 'alert')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastAlert && Date.now() - new Date(lastAlert.created_at).getTime() < ALERT_DEDUPE_MS) return;

  const recipients = getContactEmailRecipients();
  await sendEmail({
    to: recipients.effectiveContactRecipient,
    subject: `NDCC fantasy sync needs attention (${season.slug})`,
    html: `<p>The automatic PlayHQ fantasy sync for season <strong>${season.slug}</strong> has failed ${failures.length} times in a row.</p><p>Latest error: ${latestError}</p><p>Open the CMS at /admin/fantasy/seasons to review the sync health panel and retry.</p>`,
  });
  await recordRun(supabase, invokedBy, season.id, {
    seasonSlug: season.slug,
    stage: 'alert',
    status: 'ok',
    detail: { failures: failures.length, latest_error: latestError },
  });
}

/** Advance one season through as many pipeline steps as the time budget
 *  allows. Returns the logs for this season. */
async function advanceSeason(
  supabase: any,
  invokedBy: string,
  season: SeasonRow,
  deadline: number,
  batchSize: number
): Promise<RunLog[]> {
  const logs: RunLog[] = [];
  const timeLeft = () => deadline - Date.now();
  const health: Record<string, unknown> = {};
  const finishWithHealth = async () => {
    const failure = logs.find((log) => log.status === 'error' || log.status === 'blocked');
    if (failure) {
      health.last_error = failure.error || failure.stage;
      health.next_retry_at = nextScheduledRetry();
    } else {
      health.last_error = null;
      health.next_retry_at = nextScheduledRetry();
    }
    await updateSyncHealth(supabase, season.id, health);
    return logs;
  };

  try {
    // 1. Season discovery + linking.
    if (!season.playhq_season_id) {
      const log = await discoverAndLinkSeason(supabase, season);
      logs.push(log);
      if (log.status === 'ok') {
        health.last_successful_discovery = new Date().toISOString();
      }
      // 'skipped' here means PlayHQ has not published a matching season yet
      // (Awaiting PlayHQ); the CMS derives that state from the unlinked
      // season plus this health row.
      if (log.status !== 'ok') return finishWithHealth();
    } else {
      health.last_successful_discovery = new Date().toISOString();
    }

    // 2. Grade discovery + mapping (only when nothing is mapped yet; admin
    //    overrides and previous discoveries are preserved).
    const { data: enabledGrades, error: gradesError } = await supabase
      .from('fantasy_season_grade_sources')
      .select('id, enabled')
      .eq('season_id', season.id);
    if (gradesError) throw new Error(gradesError.message);
    if (!(enabledGrades ?? []).some((grade: { enabled: boolean }) => grade.enabled)) {
      if ((enabledGrades ?? []).length > 0) {
        logs.push({ seasonSlug: season.slug, stage: 'map_grades', status: 'skipped', detail: { reason: 'Grade sources exist but all are disabled by an admin; automation will not re-enable them.' } });
        return finishWithHealth();
      }
      const log = await discoverAndMapGrades(supabase, season);
      logs.push(log);
      if (log.status !== 'ok') return finishWithHealth();
    }

    // 3. Find or create the active job.
    const { data: openJob, error: jobError } = await supabase
      .from('fantasy_sync_jobs')
      .select('*')
      .eq('season_id', season.id)
      .in('status', ['pending', 'running', 'paused'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (jobError) throw new Error(jobError.message);

    let jobId: string | null = openJob?.id ?? null;
    if (openJob?.status === 'running') {
      const lastTouched = new Date(openJob.updated_at || openJob.created_at).getTime();
      if (Date.now() - lastTouched < ABANDONED_RUNNING_MS) {
        logs.push({ seasonSlug: season.slug, stage: 'resume_job', status: 'skipped', detail: { reason: 'A job is actively running.', job_id: openJob.id } });
        return finishWithHealth();
      }
      logs.push({ seasonSlug: season.slug, stage: 'recover_job', status: 'ok', detail: { job_id: openJob.id, reason: 'Recovered abandoned running job.' } });
    }

    if (!jobId) {
      // Sync cadence: current/active seasons sync on every orchestrator run
      // (stat upserts are hash-keyed, so unchanged games are cheap skips and
      // changed published games surface as reconciliation reviews). Completed
      // seasons run until they have a published PlayHQ batch (historical
      // bootstrap), then stop.
      const { data: finishedJobs } = await supabase
        .from('fantasy_sync_jobs')
        .select('id, status, completed_at, import_batch_id')
        .eq('season_id', season.id)
        .in('status', ['completed', 'needs_review'])
        .order('completed_at', { ascending: false })
        .limit(1);
      const lastFinished = finishedJobs?.[0] ?? null;

      if (lastFinished?.status === 'needs_review') {
        logs.push({ seasonSlug: season.slug, stage: 'create_job', status: 'blocked', error: 'Latest sync finished with review items; resolve them in the CMS before automation continues for this season.' });
        return finishWithHealth();
      }

      if (!season.is_current && season.status !== 'active') {
        const { count: publishedStats } = await supabase
          .from('fantasy_match_stats')
          .select('id, fantasy_import_batches!inner(status,source)', { count: 'exact', head: true })
          .eq('season_id', season.id)
          .eq('fantasy_import_batches.status', 'published')
          .eq('fantasy_import_batches.source', 'playhq-api');
        if ((publishedStats ?? 0) > 0) {
          logs.push({ seasonSlug: season.slug, stage: 'create_job', status: 'skipped', detail: { reason: 'Historical season already has published PlayHQ data.' } });
          return finishWithHealth();
        }
      } else if (lastFinished?.completed_at) {
        // Throttle current-season re-syncs to at most one full pass per 12h.
        const age = Date.now() - new Date(lastFinished.completed_at).getTime();
        if (age < 12 * 60 * 60 * 1000) {
          logs.push({ seasonSlug: season.slug, stage: 'create_job', status: 'skipped', detail: { reason: 'Last completed sync is under 12 hours old.' } });
          return finishWithHealth();
        }
      }

      if (timeLeft() < 20_000) {
        logs.push({ seasonSlug: season.slug, stage: 'create_job', status: 'skipped', detail: { reason: 'Time budget too low to start a new job this run.' } });
        return finishWithHealth();
      }
      const started = await startFantasySyncJob({ seasonId: season.id, createdBy: `orchestrator:${invokedBy}` });
      jobId = started.job!.id;
      health.raw_entries = started.rawEntries;
      health.queued_games = started.queued;
      if (started.emptyQueueInvariantBreached) {
        // Raw entries with zero queued games is never a success — the job is
        // parked in needs_review with per-grade diagnostics attached.
        const message = `Sync produced 0 queued games from ${started.rawEntries} raw PlayHQ entries; job ${jobId} parked as needs_review with diagnostics.`;
        await setSeasonException(supabase, season.id, message);
        logs.push({
          seasonSlug: season.slug,
          stage: 'create_job',
          status: 'blocked',
          error: message,
          detail: { job_id: jobId, raw_entries: started.rawEntries, queued_games: 0, grade_debug: started.gradeDebug },
        });
        return finishWithHealth();
      }
      logs.push({
        seasonSlug: season.slug,
        stage: 'create_job',
        status: 'ok',
        detail: { job_id: jobId, queued_games: started.queued, raw_entries: started.rawEntries, pre_queue_review_items: started.reviewItems.length, skipped_grades: started.skippedGrades, grade_debug: started.gradeDebug },
      });
    }

    // 4. Drain bounded batches while the time budget allows.
    let lastProgress: any = null;
    while (timeLeft() > 15_000) {
      const progress = await processFantasySyncBatch(jobId as string, batchSize);
      lastProgress = progress;
      if (progress.done) break;
    }
    if (lastProgress) {
      logs.push({
        seasonSlug: season.slug,
        stage: 'process_batches',
        status: 'ok',
        detail: {
          job_id: jobId,
          done: lastProgress.done,
          processed_games: lastProgress.job?.processed_games ?? null,
          total_games: lastProgress.job?.total_games ?? null,
        },
      });
    }

    // 5. Validate + auto-publish when the job just finished cleanly.
    const { data: finalJob } = await supabase.from('fantasy_sync_jobs').select('*').eq('id', jobId).maybeSingle();
    if (finalJob) {
      const reviewList = Array.isArray(finalJob.review_items) ? finalJob.review_items : [];
      health.raw_entries = Number(finalJob.counts?.raw_entries ?? health.raw_entries ?? 0);
      health.queued_games = Number(finalJob.total_games ?? 0);
      health.processed_games = Number(finalJob.processed_games ?? 0);
      health.failed_games = Number(finalJob.failed_games ?? 0);
      health.matched_players = Number(finalJob.counts?.matched ?? 0) + Number(finalJob.counts?.created ?? 0);
      health.ambiguous_players = reviewList.filter((item: { type?: string }) => item.type === 'duplicate_name' || item.type === 'name_match_review').length;
      if (finalJob.status === 'completed' && Number(finalJob.total_games ?? 0) > 0) {
        health.last_successful_game_import = new Date().toISOString();
      }
    }
    if (finalJob && ['completed', 'needs_review'].includes(finalJob.status)) {
      const log = await validateAndPublish(supabase, season, finalJob);
      logs.push(log);
    } else if (finalJob) {
      logs.push({ seasonSlug: season.slug, stage: 'update_status', status: 'ok', detail: { job_id: jobId, job_status: finalJob.status, processed: finalJob.processed_games, total: finalJob.total_games, note: 'Job will resume on the next scheduled run.' } });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown orchestrator error';
    logs.push({ seasonSlug: season.slug, stage: 'season_error', status: 'error', error: message });
  }
  return finishWithHealth();
}

export async function runFantasyOrchestrator(options: {
  invokedBy: string;
  timeBudgetMs?: number;
  batchSize?: number;
}): Promise<OrchestratorResult> {
  const supabase = createServerClient();
  const config = getPlayHQConfig();
  if (!config.configured) {
    return { ran: false, reason: `PlayHQ is not configured (missing: ${config.missing.join(', ')}).`, logs: [] };
  }

  const holder = `${options.invokedBy}:${Math.random().toString(36).slice(2, 10)}`;
  const { data: lockAcquired, error: lockError } = await supabase.rpc('acquire_fantasy_sync_lock', {
    p_name: LOCK_NAME,
    p_holder: holder,
    p_ttl_seconds: LOCK_TTL_SECONDS,
  });
  if (lockError) return { ran: false, reason: `Could not acquire sync lock: ${lockError.message}`, logs: [] };
  if (!lockAcquired) return { ran: false, reason: 'Another sync run holds the lock.', logs: [] };

  const deadline = Date.now() + Math.min(options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS, 50_000);
  const batchSize = options.batchSize ?? (Number(process.env.PLAYHQ_FANTASY_SYNC_BATCH_SIZE) || DEFAULT_SYNC_BATCH_SIZE);
  const logs: RunLog[] = [];

  try {
    const { data: seasons, error: seasonsError } = await supabase
      .from('fantasy_seasons')
      .select('id, name, slug, status, is_current, is_public, playhq_season_id, playhq_discovery, auto_sync_enabled, sync_exception, last_playhq_sync_at')
      .eq('auto_sync_enabled', true)
      .neq('status', 'archived')
      .eq('is_public', true);
    if (seasonsError) throw new Error(seasonsError.message);

    // Current season first, then older seasons awaiting historical bootstrap.
    const ordered = (seasons ?? []).sort((a: SeasonRow, b: SeasonRow) => Number(b.is_current) - Number(a.is_current) || a.slug.localeCompare(b.slug));
    for (const season of ordered as SeasonRow[]) {
      if (Date.now() >= deadline) {
        logs.push({ seasonSlug: season.slug, stage: 'budget_exhausted', status: 'skipped', detail: { reason: 'Time budget exhausted; season continues next run.' } });
        continue;
      }
      // Renew the lease so long single-season work cannot let it lapse.
      await supabase.rpc('acquire_fantasy_sync_lock', { p_name: LOCK_NAME, p_holder: holder, p_ttl_seconds: LOCK_TTL_SECONDS });
      const seasonLogs = await advanceSeason(supabase, options.invokedBy, season, deadline, batchSize);
      logs.push(...seasonLogs);
      for (const log of seasonLogs) {
        await recordRun(supabase, options.invokedBy, season.id, log);
      }
      const failure = seasonLogs.find((log) => log.status === 'error' || log.status === 'blocked');
      if (failure) {
        await maybeAlertAdmins(supabase, options.invokedBy, season, failure.error || failure.stage);
      }
    }
  } finally {
    await supabase.rpc('release_fantasy_sync_lock', { p_name: LOCK_NAME, p_holder: holder });
  }

  return { ran: true, logs };
}

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

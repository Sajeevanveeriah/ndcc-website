/* eslint-disable @typescript-eslint/no-explicit-any */
// Per-season state-machine driver of the fantasy PlayHQ orchestrator.
// Split out of lib/playhq/fantasy-orchestrator.ts (which re-exports the public API).
import 'server-only';
import { canRetryEmptyFixtureJob } from '../fantasy-import';
import { processFantasySyncBatch, startFantasySyncJob } from '../fantasy-sync';
import { ABANDONED_RUNNING_MS, type RunLog, type SeasonRow, setSeasonException, nextScheduledRetry, updateSyncHealth } from './shared';
import { discoverAndLinkSeason, discoverAndMapGrades } from './discovery';
import { validateAndPublish } from './publish';

/** Advance one season through as many pipeline steps as the time budget
 *  allows. Returns the logs for this season. */
export async function advanceSeason(
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
        .select('id, status, completed_at, import_batch_id, total_games, processed_games, failed_games, review_items, counts')
        .eq('season_id', season.id)
        .in('status', ['completed', 'needs_review'])
        .order('completed_at', { ascending: false })
        .limit(1);
      const lastFinished = finishedJobs?.[0] ?? null;

      const retryEmptyJob = lastFinished && canRetryEmptyFixtureJob(lastFinished);
      if (lastFinished?.status === 'needs_review' && !retryEmptyJob) {
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
      } else if (lastFinished?.completed_at && !retryEmptyJob) {
        // Throttle current-season re-syncs to at most one full pass per 12h.
        const age = Date.now() - new Date(lastFinished.completed_at).getTime();
        const manualRun = invokedBy.startsWith('admin:') || invokedBy.startsWith('release-token:');
        if (age < 12 * 60 * 60 * 1000 && !manualRun) {
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
      if (retryEmptyJob && started.reviewItems.length === 0 && started.skippedGrades.length === 0) {
        // A fresh fetch must explain the old empty queue before retiring it.
        // Keep its diagnostics and batch as audit evidence, never publish it.
        const { error: recoveryError } = await supabase.from('fantasy_sync_jobs').update({
          status: 'cancelled',
          counts: { ...lastFinished.counts, superseded_by: jobId, resolution: 'Revalidated fixture states with preseason-aware importer.' },
        }).eq('id', lastFinished.id).eq('status', 'needs_review');
        if (recoveryError) throw new Error(recoveryError.message);
        await setSeasonException(supabase, season.id, null);
        logs.push({ seasonSlug: season.slug, stage: 'recover_job', status: 'ok', detail: { previous_job_id: lastFinished.id, replacement_job_id: jobId } });
      }
      logs.push({
        seasonSlug: season.slug,
        stage: 'create_job',
        status: 'ok',
        detail: { job_id: jobId, queued_games: started.queued, raw_entries: started.rawEntries, awaiting_results: started.awaitingResults, pre_queue_review_items: started.reviewItems.length, skipped_grades: started.skippedGrades, grade_debug: started.gradeDebug },
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

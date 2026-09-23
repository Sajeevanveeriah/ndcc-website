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
import { createServerClient } from '@/lib/supabase-server';
import { getPlayHQConfig } from './config';
import { DEFAULT_SYNC_BATCH_SIZE } from './fantasy-sync';
import { LOCK_NAME, LOCK_TTL_SECONDS, DEFAULT_TIME_BUDGET_MS, type RunLog, type OrchestratorResult, type SeasonRow, recordRun } from './orchestrator/shared';
import { maybeAlertAdmins } from './orchestrator/alerts';
import { advanceSeason } from './orchestrator/advance';

export type { OrchestratorResult } from './orchestrator/shared';
export { getFantasySyncHealth, previewFantasySeasonSync } from './orchestrator/health';

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
      .eq('status', 'active');
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

/* eslint-disable @typescript-eslint/no-explicit-any */
// Shared constants, types and run/health bookkeeping for the fantasy PlayHQ orchestrator.
// Split out of lib/playhq/fantasy-orchestrator.ts (which re-exports the public API).
import 'server-only';

export const LOCK_NAME = 'playhq-fantasy-orchestrator';

export const LOCK_TTL_SECONDS = 120;

export const DEFAULT_TIME_BUDGET_MS = 45_000;

// A job stuck in `running` whose row has not been touched for this long is
// considered abandoned (the serverless invocation died) and is resumed.
export const ABANDONED_RUNNING_MS = 15 * 60 * 1000;

// Consecutive failed orchestrator runs for a season before an alert email.
export const ALERT_AFTER_FAILURES = 3;

export const ALERT_DEDUPE_MS = 24 * 60 * 60 * 1000;

export type RunLog = {
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

export type SeasonRow = {
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

export async function recordRun(supabase: any, invokedBy: string, seasonId: string | null, log: RunLog) {
  await supabase.from('fantasy_sync_runs').insert({
    invoked_by: invokedBy,
    season_id: seasonId,
    stage: log.stage,
    status: log.status,
    detail: log.detail ?? null,
    error: log.error ?? null,
  });
}

export async function setSeasonException(supabase: any, seasonId: string, message: string | null) {
  await supabase.from('fantasy_seasons').update({ sync_exception: message }).eq('id', seasonId);
}

/** Next scheduled cron firing (daily 16:30 UTC per vercel.json). */
export function nextScheduledRetry(): string {
  const next = new Date();
  next.setUTCHours(16, 30, 0, 0);
  if (next.getTime() <= Date.now()) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

/** Upsert the per-season sync health record. Best-effort: health must never
 *  break the pipeline itself (e.g. before its migration is applied). */
export async function updateSyncHealth(supabase: any, seasonId: string, patch: Record<string, unknown>) {
  try {
    await supabase
      .from('fantasy_sync_health')
      .upsert({ season_id: seasonId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'season_id' });
  } catch {
    /* table may not exist yet */
  }
}

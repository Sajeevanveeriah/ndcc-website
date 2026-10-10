/* eslint-disable @typescript-eslint/no-explicit-any */
// Keeps Dino Coach manager round scores in step with published PlayHQ stats.
// Runs for every auto-sync season on every orchestrator run (cron or admin),
// after the season's import step. A round is re-scored when it has published
// stats and its newest saved score predates the season's last publish
// (fantasy_seasons.last_playhq_sync_at, stamped by validateAndPublish), or it
// has no saved scores yet. Scoring is idempotent and each round is saved on
// its own, so a run that hits its time budget simply leaves the remaining
// rounds for the next run: nothing is lost if a run ends early.
import 'server-only';
import { saveRoundScores } from '@/lib/dino-coach/round-scores';
import { fetchAllPages } from '@/lib/fantasy-paging';
import { revalidateDinoPublicCache } from '@/lib/server/revalidate-public';
import type { RunLog, SeasonRow } from './shared';

/** Seconds left below which no new round is started. */
const MIN_ROUND_BUDGET_MS = 8_000;

/** Pure: the rounds whose saved scores are missing or older than the last publish. */
export function roundsNeedingScores(
  statRoundIds: Array<string | null>,
  scores: Array<{ round_id: string | null; calculated_at: string | null }>,
  lastPublishedAt: string | null,
): string[] {
  const latestScore = new Map<string, number>();
  for (const score of scores) {
    if (!score.round_id) continue;
    const at = Date.parse(score.calculated_at || '') || 0;
    latestScore.set(score.round_id, Math.max(latestScore.get(score.round_id) ?? 0, at));
  }
  const published = Date.parse(lastPublishedAt || '') || 0;
  return [...new Set(statRoundIds.filter((id): id is string => Boolean(id)))]
    .filter((roundId) => !latestScore.has(roundId) || (latestScore.get(roundId) ?? 0) < published)
    .sort();
}

export async function catchUpRoundScores(supabase: any, season: SeasonRow, deadline: number): Promise<RunLog | null> {
  try {
    const [{ data: seasonRow, error: seasonError }, stats, scores] = await Promise.all([
      supabase.from('fantasy_seasons').select('last_playhq_sync_at').eq('id', season.id).maybeSingle(),
      fetchAllPages<any>((from, to) => supabase.from('fantasy_match_stats')
        .select('id, round_id, fantasy_import_batches!inner(status)')
        .eq('season_id', season.id).eq('fantasy_import_batches.status', 'published')
        .order('id', { ascending: true }).range(from, to)),
      fetchAllPages<any>((from, to) => supabase.from('fantasy_manager_round_scores')
        .select('id, round_id, calculated_at').eq('season_id', season.id)
        .order('id', { ascending: true }).range(from, to)),
    ]);
    if (seasonError) throw new Error(seasonError.message);
    const pending = roundsNeedingScores(stats.map((row: any) => row.round_id), scores, seasonRow?.last_playhq_sync_at ?? null);
    if (!pending.length) return null;
    const scored: Array<{ roundId: string; managers?: number; error?: string }> = [];
    for (const roundId of pending) {
      if (deadline - Date.now() < MIN_ROUND_BUDGET_MS) break;
      try {
        const saved = await saveRoundScores(roundId, season.id);
        scored.push({ roundId, managers: saved.rows.length });
      } catch (error) {
        scored.push({ roundId, error: error instanceof Error ? error.message : 'Round scoring failed.' });
      }
    }
    if (scored.length) revalidateDinoPublicCache();
    const failed = scored.filter((round) => round.error);
    return {
      seasonSlug: season.slug,
      stage: 'score_rounds',
      status: failed.length ? 'error' : 'ok',
      ...(failed.length ? { error: failed.map((round) => `${round.roundId}: ${round.error}`).join('; ') } : {}),
      detail: { scored, remaining: pending.length - scored.length },
    };
  } catch (error) {
    return { seasonSlug: season.slug, stage: 'score_rounds', status: 'error', error: error instanceof Error ? error.message : 'Round scoring failed.' };
  }
}

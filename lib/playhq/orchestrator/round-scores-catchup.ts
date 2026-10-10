/* eslint-disable @typescript-eslint/no-explicit-any */
// Keeps Dino Coach manager round scores in step with published PlayHQ stats.
// Runs for every auto-sync season on every orchestrator run (cron or admin),
// after the season's import step. A round is re-scored when it has published
// stats and its newest saved score predates its own newest published stat
// change (the later of the stat's changed_at and its batch's published_at,
// both stamped by database triggers), or it has no saved scores yet. These
// per-round stamps only move when the round's inputs move, so once a round is
// scored it stays settled. Scoring is idempotent and each round is saved on
// its own, so a run that hits its time budget simply leaves the remaining
// rounds for the next run: nothing is lost if a run ends early.
import 'server-only';
import { saveRoundScores } from '@/lib/dino-coach/round-scores';
import { fetchAllPages } from '@/lib/fantasy-paging';
import { revalidateDinoPublicCache } from '@/lib/server/revalidate-public';
import type { RunLog, SeasonRow } from './shared';

/** Seconds left below which no new round is started. */
const MIN_ROUND_BUDGET_MS = 8_000;

type StatChange = { round_id: string | null; changed_at?: string | null; published_at?: string | null };

/** Pure: the rounds whose saved scores are missing or older than their newest published stat change. */
export function roundsNeedingScores(
  stats: StatChange[],
  scores: Array<{ round_id: string | null; calculated_at: string | null }>,
): string[] {
  const latestChange = new Map<string, number>();
  for (const stat of stats) {
    if (!stat.round_id) continue;
    const at = Math.max(Date.parse(stat.changed_at || '') || 0, Date.parse(stat.published_at || '') || 0);
    latestChange.set(stat.round_id, Math.max(latestChange.get(stat.round_id) ?? 0, at));
  }
  const latestScore = new Map<string, number>();
  for (const score of scores) {
    if (!score.round_id) continue;
    const at = Date.parse(score.calculated_at || '') || 0;
    latestScore.set(score.round_id, Math.max(latestScore.get(score.round_id) ?? 0, at));
  }
  return [...latestChange.keys()]
    .filter((roundId) => !latestScore.has(roundId) || (latestScore.get(roundId) ?? 0) < (latestChange.get(roundId) ?? 0))
    .sort();
}

export async function catchUpRoundScores(supabase: any, season: SeasonRow, deadline: number): Promise<RunLog | null> {
  try {
    const [stats, scores] = await Promise.all([
      fetchAllPages<any>((from, to) => supabase.from('fantasy_match_stats')
        .select('id, round_id, changed_at, fantasy_import_batches!inner(status, published_at)')
        .eq('season_id', season.id).eq('fantasy_import_batches.status', 'published')
        .order('id', { ascending: true }).range(from, to)),
      fetchAllPages<any>((from, to) => supabase.from('fantasy_manager_round_scores')
        .select('id, round_id, calculated_at').eq('season_id', season.id)
        .order('id', { ascending: true }).range(from, to)),
    ]);
    const pending = roundsNeedingScores(stats.map((row: any) => ({
      round_id: row.round_id,
      changed_at: row.changed_at,
      published_at: row.fantasy_import_batches?.published_at,
    })), scores);
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

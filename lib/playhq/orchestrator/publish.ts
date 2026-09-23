/* eslint-disable @typescript-eslint/no-explicit-any */
// Validation and auto-publication step of the fantasy PlayHQ orchestrator.
// Split out of lib/playhq/fantasy-orchestrator.ts (which re-exports the public API).
import 'server-only';
import { revalidatePath } from 'next/cache';
import { type RunLog, type SeasonRow, setSeasonException } from './shared';

/** Validate a finished job's draft batch and publish it when every blocking
 *  gate passes. Blocking issues keep the previous published state untouched. */
export async function validateAndPublish(supabase: any, season: SeasonRow, job: any): Promise<RunLog> {
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
    const awaitingResults = totalGames === 0 && Number(job.counts?.awaiting_results ?? 0) > 0;
    const reason = awaitingResults ? 'Fixtures discovered; awaiting completed games. No match stats published.' : 'No changes to publish; existing published data already current.';
    const { error: closeError } = await supabase.from('fantasy_import_batches').update({ status: 'rejected', notes: reason }).eq('id', batch.id);
    if (closeError) throw new Error(closeError.message);
    await setSeasonException(supabase, season.id, null);
    return { seasonSlug: season.slug, stage: 'publish_batch', status: 'ok', detail: { batch_id: batch.id, published: false, reason } };
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

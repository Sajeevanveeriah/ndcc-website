/* eslint-disable @typescript-eslint/no-explicit-any */
// Scheduled PlayHQ fantasy sync: resumes one bounded batch of the newest
// unfinished sync job for the current season. Guarded by CRON_SECRET and the
// PLAYHQ_FANTASY_SYNC_ENABLED flag; manual "Sync now" in the CMS is unaffected.
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { DEFAULT_SYNC_BATCH_SIZE, processFantasySyncBatch } from '@/lib/playhq/fantasy-sync';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
  }
  if (process.env.PLAYHQ_FANTASY_SYNC_ENABLED !== 'true') {
    return NextResponse.json({ success: true, skipped: true, reason: 'PLAYHQ_FANTASY_SYNC_ENABLED is not true.' });
  }

  try {
    const supabase = createServerClient();
    const { data: season, error: seasonError } = await supabase.from('fantasy_seasons').select('id, slug').eq('is_current', true).limit(1).maybeSingle();
    if (seasonError) throw new Error(seasonError.message);
    if (!season) return NextResponse.json({ success: true, skipped: true, reason: 'No current fantasy season.' });

    const { data: job, error: jobError } = await supabase
      .from('fantasy_sync_jobs')
      .select('id, status')
      .eq('season_id', season.id)
      .in('status', ['pending', 'running', 'paused'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (jobError) throw new Error(jobError.message);
    if (!job) return NextResponse.json({ success: true, skipped: true, reason: 'No resumable sync job for the current season.' });

    const batchSize = Number(process.env.PLAYHQ_FANTASY_SYNC_BATCH_SIZE) || DEFAULT_SYNC_BATCH_SIZE;
    const progress = await processFantasySyncBatch(job.id, batchSize);
    return NextResponse.json({ success: true, season: season.slug, jobId: job.id, done: progress.done, processed: progress.processed });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Cron sync failed.' }, { status: 500 });
  }
}

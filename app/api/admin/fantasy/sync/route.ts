/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/guard';
import { FANTASY_ADMIN_ROLES } from '@/lib/auth/config';
import { createServerClient } from '@/lib/supabase-server';
import { DEFAULT_SYNC_BATCH_SIZE, processFantasySyncBatch, retryFailedGames, startFantasySyncJob } from '@/lib/playhq/fantasy-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const noStore = { 'Cache-Control': 'no-store', Vary: 'Cookie' } as const;

const JOB_COLUMNS = 'id, season_id, import_batch_id, status, total_games, processed_games, successful_games, failed_games, counts, review_items, error_summary, started_at, completed_at, created_at';

export async function GET(request: Request) {
  const user = await requireSession(FANTASY_ADMIN_ROLES);
  if (!user) return NextResponse.json({ success: false, error: 'Admin sign in is required.' }, { status: 403, headers: noStore });
  const url = new URL(request.url);
  const seasonId = url.searchParams.get('seasonId');
  const supabase = createServerClient();
  let query = supabase.from('fantasy_sync_jobs').select(JOB_COLUMNS).order('created_at', { ascending: false }).limit(20);
  if (seasonId) query = query.eq('season_id', seasonId);
  const { data: jobs, error } = await query;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: noStore });
  return NextResponse.json({ success: true, jobs }, { headers: noStore });
}

export async function POST(request: Request) {
  const user = await requireSession(FANTASY_ADMIN_ROLES);
  if (!user) return NextResponse.json({ success: false, error: 'Admin sign in is required.' }, { status: 403, headers: noStore });
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || '');
  try {
    if (action === 'start') {
      const seasonId = String(body.seasonId || '').trim();
      if (!seasonId) return NextResponse.json({ success: false, error: 'seasonId is required.' }, { status: 400, headers: noStore });
      const started = await startFantasySyncJob({ seasonId, createdBy: user.email });
      // Immediately process the first bounded batch so "Start import" shows
      // progress without a second click; later batches run via Continue/cron.
      const progress = await processFantasySyncBatch(started.job.id, Number(body.batchSize) || DEFAULT_SYNC_BATCH_SIZE);
      return NextResponse.json({ success: true, jobId: started.job.id, queued: started.queued, ...progress }, { headers: noStore });
    }
    if (action === 'continue') {
      const jobId = String(body.jobId || '').trim();
      if (!jobId) return NextResponse.json({ success: false, error: 'jobId is required.' }, { status: 400, headers: noStore });
      const progress = await processFantasySyncBatch(jobId, Number(body.batchSize) || DEFAULT_SYNC_BATCH_SIZE);
      return NextResponse.json({ success: true, jobId, ...progress }, { headers: noStore });
    }
    if (action === 'retry_failed') {
      const jobId = String(body.jobId || '').trim();
      if (!jobId) return NextResponse.json({ success: false, error: 'jobId is required.' }, { status: 400, headers: noStore });
      const result = await retryFailedGames(jobId);
      return NextResponse.json({ success: true, jobId, requeued: result.requeued }, { headers: noStore });
    }
    return NextResponse.json({ success: false, error: 'Unsupported action. Use start, continue or retry_failed.' }, { status: 400, headers: noStore });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Sync action failed.' }, { status: 500, headers: noStore });
  }
}

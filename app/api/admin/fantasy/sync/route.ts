/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { DEFAULT_SYNC_BATCH_SIZE, processFantasySyncBatch, retryFailedGames, startFantasySyncJob } from '@/lib/playhq/fantasy-sync';
import { getFantasySyncHealth, previewFantasySeasonSync, runFantasyOrchestrator } from '@/lib/playhq/fantasy-orchestrator';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const noStore = { 'Cache-Control': 'no-store', Vary: 'Cookie' } as const;

const JOB_COLUMNS = 'id, season_id, import_batch_id, status, total_games, processed_games, successful_games, failed_games, counts, review_items, error_summary, started_at, completed_at, created_at';

export async function GET(request: Request) {
  const user = await requirePermission('fantasy.seasons');
  if (!user) return NextResponse.json({ success: false, error: 'Admin sign in is required.' }, { status: 403, headers: noStore });
  const url = new URL(request.url);
  if (url.searchParams.get('health') === '1') {
    try {
      const health = await getFantasySyncHealth();
      return NextResponse.json({ success: true, health }, { headers: noStore });
    } catch (err) {
      return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Health check failed.' }, { status: 500, headers: noStore });
    }
  }
  const seasonId = url.searchParams.get('seasonId');
  const supabase = createServerClient();
  let query = supabase.from('fantasy_sync_jobs').select(JOB_COLUMNS).order('created_at', { ascending: false }).limit(20);
  if (seasonId) query = query.eq('season_id', seasonId);
  const { data: jobs, error } = await query;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: noStore });
  return NextResponse.json({ success: true, jobs }, { headers: noStore });
}

export async function POST(request: Request) {
  const user = await requirePermission('fantasy.seasons');
  if (!user) return NextResponse.json({ success: false, error: 'Admin sign in is required.' }, { status: 403, headers: noStore });
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || '');
  try {
    if (action === 'start') {
      const seasonId = String(body.seasonId || '').trim();
      if (!seasonId) return NextResponse.json({ success: false, error: 'seasonId is required.' }, { status: 400, headers: noStore });
      const started = await startFantasySyncJob({ seasonId, createdBy: user.email });
      if (!started.job) {
        return NextResponse.json({ success: false, error: 'Sync job was not created.' }, { status: 500, headers: noStore });
      }
      if (started.emptyQueueInvariantBreached) {
        return NextResponse.json({
          success: true,
          jobId: started.job.id,
          queued: 0,
          rawEntries: started.rawEntries,
          needsReview: true,
          message: 'PlayHQ returned raw entries but no games queued; the job is parked as needs_review with diagnostics.',
        }, { headers: noStore });
      }
      const progress = await processFantasySyncBatch(started.job.id, Number(body.batchSize) || DEFAULT_SYNC_BATCH_SIZE);
      return NextResponse.json({ success: true, jobId: started.job.id, queued: started.queued, ...progress }, { headers: noStore });
    }
    if (action === 'continue') {
      const jobId = String(body.jobId || '').trim();
      if (!jobId) return NextResponse.json({ success: false, error: 'jobId is required.' }, { status: 400, headers: noStore });
      const progress = await processFantasySyncBatch(jobId, Number(body.batchSize) || DEFAULT_SYNC_BATCH_SIZE);
      return NextResponse.json({ success: true, jobId, ...progress }, { headers: noStore });
    }
    if (action === 'orchestrate') {
      const result = await runFantasyOrchestrator({ invokedBy: `admin:${user.email}` });
      return NextResponse.json({ success: true, ...result }, { headers: noStore });
    }
    if (action === 'preview') {
      const seasonId = String(body.seasonId || '').trim();
      if (!seasonId) return NextResponse.json({ success: false, error: 'seasonId is required.' }, { status: 400, headers: noStore });
      const preview = await previewFantasySeasonSync(seasonId);
      return NextResponse.json({ success: true, preview }, { headers: noStore });
    }
    if (action === 'retry_failed') {
      const jobId = String(body.jobId || '').trim();
      if (!jobId) return NextResponse.json({ success: false, error: 'jobId is required.' }, { status: 400, headers: noStore });
      const result = await retryFailedGames(jobId);
      return NextResponse.json({ success: true, jobId, requeued: result.requeued }, { headers: noStore });
    }
    return NextResponse.json({ success: false, error: 'Unsupported action. Use start, continue, orchestrate, preview or retry_failed.' }, { status: 400, headers: noStore });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Sync action failed.' }, { status: 500, headers: noStore });
  }
}

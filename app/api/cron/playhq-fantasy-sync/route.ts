// Scheduled PlayHQ fantasy sync. The orchestrator advances every eligible
// season end-to-end each run: discover + link the PlayHQ season, discover and
// map NDCC grades, create or resume the bounded sync job, drain batches
// within the function's time budget, validate and auto-publish clean batches,
// record health and alert admins after repeated failures. Guarded by
// CRON_SECRET and the PLAYHQ_FANTASY_SYNC_ENABLED flag; the run is protected
// against concurrent invocations by a database-backed lease.
import { NextResponse } from 'next/server';
import { runFantasyOrchestrator } from '@/lib/playhq/fantasy-orchestrator';
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
    const result = await runFantasyOrchestrator({ invokedBy: 'cron' });
    return NextResponse.json({ success: true, ran: result.ran, reason: result.reason ?? null, logs: result.logs });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Cron sync failed.' }, { status: 500 });
  }
}

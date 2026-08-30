import { NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { processPaymentReceiptJobs } from '@/lib/payments/receipt-delivery';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store' };
const WORK_BUDGET_MS = 45_000;
const MAX_JOBS_PER_RUN = 100;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized.' },
      { status: 401, headers: NO_STORE },
    );
  }

  try {
    const supabase = createServerClient({ fetchTimeoutMs: null });
    const totals = {
      claimed: 0,
      delivered: 0,
      retrying: 0,
      cancelled: 0,
      deadLettered: 0,
      completionErrors: 0,
    };
    const deadline = Date.now() + WORK_BUDGET_MS;
    while (totals.claimed < MAX_JOBS_PER_RUN && Date.now() < deadline) {
      // Claim one at a time so a function timeout strands at most one lease;
      // all unclaimed work remains immediately available to another run.
      const batch = await processPaymentReceiptJobs({
        supabase,
        limit: 1,
        leaseSeconds: 300,
      });
      totals.claimed += batch.claimed;
      totals.delivered += batch.delivered;
      totals.retrying += batch.retrying;
      totals.cancelled += batch.cancelled;
      totals.deadLettered += batch.deadLettered;
      totals.completionErrors += batch.completionErrors;
      if (batch.claimed === 0) break;
    }
    const observedAt = new Date().toISOString();
    const [deadLetters, dueJobs] = await Promise.all([
      supabase
        .from('receipt_delivery_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'dead_letter'),
      supabase
        .from('receipt_delivery_jobs')
        .select('id', { count: 'exact', head: true })
        .in('status', ['queued', 'retry'])
        .lte('next_attempt_at', observedAt),
    ]);
    const deadLetterTotal = deadLetters.error ? null : deadLetters.count || 0;
    const dueRemaining = dueJobs.error ? null : dueJobs.count || 0;
    if (deadLetters.error || dueJobs.error) {
      console.error(
        '[receipt-delivery] Could not read queue health:',
        deadLetters.error?.message || dueJobs.error?.message,
      );
    }
    if (deadLetterTotal && deadLetterTotal > 0) {
      console.error(`[receipt-delivery] ${deadLetterTotal} job(s) are dead-lettered.`);
    }
    if (dueRemaining && dueRemaining > 0) {
      console.error(
        `[receipt-delivery] ${dueRemaining} due job(s) remain blocked or outside this run's budget.`,
      );
    }
    const response = {
      success: totals.completionErrors === 0,
      claimed: totals.claimed,
      delivered: totals.delivered,
      retrying: totals.retrying,
      cancelled: totals.cancelled,
      dead_lettered: totals.deadLettered,
      dead_letter_total: deadLetterTotal,
      due_remaining: dueRemaining,
      completion_errors: totals.completionErrors,
    };
    return NextResponse.json(response, {
      status: totals.completionErrors === 0 ? 200 : 500,
      headers: NO_STORE,
    });
  } catch (error) {
    console.error('[receipt-delivery] Cron failed:', error);
    return NextResponse.json(
      { success: false, error: 'Receipt delivery could not be processed.' },
      { status: 500, headers: NO_STORE },
    );
  }
}

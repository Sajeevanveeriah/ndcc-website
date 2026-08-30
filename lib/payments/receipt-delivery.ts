import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase-server';
import { sendDinoCoachPaymentReceiptForEntry } from '@/lib/dino-coach/payment-receipt';
import {
  sendOrderPaymentReceiptForPayment,
  type PaymentReceiptSendResult,
} from '@/lib/payment-receipts';
import { sendPaidRaffleEmails } from '@/lib/raffle-email';
import { canRecordSimulatedReceiptDelivery } from '@/lib/payments/receipt-delivery-policy';

export type ReceiptDeliveryKind = 'order_payment' | 'raffle_order' | 'dino_entry';

type ReceiptDeliveryJob = {
  id: string;
  created_at: string;
  receipt_kind: ReceiptDeliveryKind;
  order_payment_id: string | null;
  raffle_order_id: string | null;
  dino_entry_id: string | null;
  attempts: number;
};

export type ReceiptDeliveryRun = {
  workerId: string;
  claimed: number;
  delivered: number;
  retrying: number;
  cancelled: number;
  deadLettered: number;
  completionErrors: number;
};

export type ImmediateReceiptDeliveryAttempt = {
  attempted: boolean;
  status: 'not_claimed' | 'delivered' | 'retry' | 'cancelled' | 'dead_letter' | 'completion_failed' | 'claim_failed';
  reason?: string;
};

function resultError(result: PaymentReceiptSendResult): string {
  return result.status === 'failed' ? result.reason : 'Receipt delivery did not complete.';
}

async function deliverOrderPayment(
  supabase: SupabaseClient,
  paymentId: string,
  issuedAt: string,
): Promise<PaymentReceiptSendResult> {
  const { data: payment, error } = await supabase
    .from('order_payments')
    .select('order_id')
    .eq('id', paymentId)
    .maybeSingle();
  if (error || !payment?.order_id) {
    return { status: 'failed', reason: error?.message || 'Order payment was not found.' };
  }
  return sendOrderPaymentReceiptForPayment(
    supabase,
    paymentId,
    String(payment.order_id),
    { issuedAt },
  );
}

async function deliverJob(
  supabase: SupabaseClient,
  job: ReceiptDeliveryJob,
): Promise<PaymentReceiptSendResult> {
  if (job.receipt_kind === 'order_payment' && job.order_payment_id) {
    return deliverOrderPayment(supabase, job.order_payment_id, job.created_at);
  }
  if (job.receipt_kind === 'raffle_order' && job.raffle_order_id) {
    return sendPaidRaffleEmails(job.raffle_order_id, { issuedAt: job.created_at });
  }
  if (job.receipt_kind === 'dino_entry' && job.dino_entry_id) {
    return sendDinoCoachPaymentReceiptForEntry(
      supabase,
      job.dino_entry_id,
      { issuedAt: job.created_at },
    );
  }
  return { status: 'failed', reason: 'Receipt-delivery job has an invalid source identity.' };
}

async function preflightClaimedJob(
  supabase: SupabaseClient,
  workerId: string,
  jobId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const checked = await supabase.rpc('preflight_payment_receipt_job', {
    target_job_id: jobId,
    target_worker_id: workerId,
  });
  if (checked.error) {
    return {
      ok: false,
      reason: `Receipt-delivery preflight failed: ${checked.error.message}`,
    };
  }
  const result = checked.data?.[0] as { eligible?: boolean; reason?: string | null } | undefined;
  if (result?.eligible !== true) {
    return {
      ok: false,
      reason: result?.reason || 'Receipt source is not currently eligible for delivery.',
    };
  }
  return { ok: true };
}

async function finishClaimedJob(
  supabase: SupabaseClient,
  workerId: string,
  job: ReceiptDeliveryJob,
): Promise<{ status: string; completionError: string | null }> {
  let result: PaymentReceiptSendResult;
  try {
    const preflight = await preflightClaimedJob(supabase, workerId, job.id);
    result = preflight.ok
      ? await deliverJob(supabase, job)
      : { status: 'failed', reason: preflight.reason };
  } catch (error) {
    result = {
      status: 'failed',
      reason: error instanceof Error ? error.message : 'Unexpected receipt-delivery failure.',
    };
  }

  const delivered = result.status === 'sent'
    || result.status === 'sent_unrecorded'
    || (result.status === 'simulated' && canRecordSimulatedReceiptDelivery())
    || result.status === 'already_sent';
  const completionNote = result.status === 'sent_unrecorded'
    ? `Provider accepted the receipt, but its source marker was not recorded: ${result.reason}`
    : null;
  const finished = await supabase.rpc('finish_payment_receipt_job', {
    target_job_id: job.id,
    target_worker_id: workerId,
    target_delivered: delivered,
    target_provider_message_id: delivered && 'id' in result ? result.id || null : null,
    target_receipt_filename: delivered && 'filename' in result ? result.filename || null : null,
    target_error: delivered ? completionNote : resultError(result),
  });
  if (finished.error) {
    console.error(`[receipt-delivery] Could not finish job ${job.id}:`, finished.error.message);
    return { status: 'completion_failed', completionError: finished.error.message };
  }
  return { status: String(finished.data?.[0]?.status || ''), completionError: null };
}

export async function enqueuePaymentReceiptJob(
  supabase: SupabaseClient,
  receiptKind: ReceiptDeliveryKind,
  sourceId: string,
): Promise<{ ok: true; jobId: string } | { ok: false; reason: string }> {
  const { data, error } = await supabase.rpc('enqueue_payment_receipt_job', {
    target_receipt_kind: receiptKind,
    target_source_id: sourceId,
    target_not_before: new Date().toISOString(),
  });
  if (error || typeof data !== 'string') {
    return { ok: false, reason: error?.message || 'Receipt delivery could not be queued.' };
  }
  return { ok: true, jobId: data };
}

export async function attemptPaymentReceiptDelivery(
  supabase: SupabaseClient,
  jobId: string,
  options: { workerId?: string; leaseSeconds?: number } = {},
): Promise<ImmediateReceiptDeliveryAttempt> {
  const workerId = options.workerId || crypto.randomUUID();
  const leaseSeconds = Math.min(900, Math.max(60, Math.round(options.leaseSeconds || 300)));
  try {
    const claimed = await supabase.rpc('claim_payment_receipt_job', {
      target_job_id: jobId,
      target_worker_id: workerId,
      target_lease_seconds: leaseSeconds,
    });
    if (claimed.error) {
      return { attempted: false, status: 'claim_failed', reason: claimed.error.message };
    }
    const job = claimed.data?.[0] as ReceiptDeliveryJob | undefined;
    if (!job) return { attempted: false, status: 'not_claimed' };

    const finished = await finishClaimedJob(supabase, workerId, job);
    if (finished.completionError) {
      return {
        attempted: true,
        status: 'completion_failed',
        reason: finished.completionError,
      };
    }
    if (finished.status === 'delivered') return { attempted: true, status: 'delivered' };
    if (finished.status === 'cancelled') return { attempted: true, status: 'cancelled' };
    if (finished.status === 'dead_letter') return { attempted: true, status: 'dead_letter' };
    return { attempted: true, status: 'retry' };
  } catch (error) {
    return {
      attempted: false,
      status: 'claim_failed',
      reason: error instanceof Error ? error.message : 'Immediate receipt delivery failed.',
    };
  }
}

export async function processPaymentReceiptJobs(options: {
  supabase?: SupabaseClient;
  workerId?: string;
  limit?: number;
  leaseSeconds?: number;
} = {}): Promise<ReceiptDeliveryRun> {
  const supabase = options.supabase || createServerClient({ fetchTimeoutMs: null });
  const workerId = options.workerId || crypto.randomUUID();
  const limit = Math.min(25, Math.max(1, Math.round(options.limit || 5)));
  const leaseSeconds = Math.min(900, Math.max(60, Math.round(options.leaseSeconds || 300)));
  const claimed = await supabase.rpc('claim_payment_receipt_jobs', {
    target_worker_id: workerId,
    target_limit: limit,
    target_lease_seconds: leaseSeconds,
  });
  if (claimed.error) throw new Error(`Receipt-delivery claim failed: ${claimed.error.message}`);

  const jobs = (claimed.data || []) as ReceiptDeliveryJob[];
  const summary: ReceiptDeliveryRun = {
    workerId,
    claimed: jobs.length,
    delivered: 0,
    retrying: 0,
    cancelled: 0,
    deadLettered: 0,
    completionErrors: 0,
  };

  for (const job of jobs) {
    const finished = await finishClaimedJob(supabase, workerId, job);
    if (finished.completionError) {
      summary.completionErrors += 1;
      continue;
    }

    const finalStatus = finished.status;
    if (finalStatus === 'delivered') summary.delivered += 1;
    else if (finalStatus === 'cancelled') summary.cancelled += 1;
    else if (finalStatus === 'dead_letter') summary.deadLettered += 1;
    else summary.retrying += 1;
  }

  return summary;
}

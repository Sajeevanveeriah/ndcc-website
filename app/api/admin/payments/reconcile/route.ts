import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/auth/guard';
import {
  isExactBalanceMatch,
  scoreOrderMatch,
  type CandidateOrder,
  type ImportedTransaction,
} from '@/lib/payments/matching';
import { attemptPaymentReceiptDelivery, enqueuePaymentReceiptJob } from '@/lib/payments/receipt-delivery';
import { sendPaidStaffOrderNotificationForPayment } from '@/lib/order-notifications';

export const dynamic = 'force-dynamic';

export async function POST() {
  const user = await requirePermission('payments', ['admin']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const supabase = createServerClient();

  const [{ data: transactions, error: txFetchError }, { data: orders, error: orderFetchError }] = await Promise.all([
    supabase.from('imported_transactions').select('*').in('match_status', ['unmatched', 'needs_review']).order('transaction_date', { ascending: false }),
    supabase.from('orders').select('id, balance_due, payment_reference, customer_name, created_at').in('payment_status', ['pending_bank_transfer', 'pending', 'unpaid', 'part_paid']).gt('balance_due', 0),
  ]);
  if (txFetchError || orderFetchError) {
    return NextResponse.json({ success: false, error: txFetchError?.message || orderFetchError?.message || 'Failed to load reconciliation data.' }, { status: 500 });
  }

  let autoMatched = 0;
  let needsReview = 0;
  let reviewUpdateFailures = 0;

  const markNeedsReview = async (transactionId: string) => {
    const { error } = await supabase.from('imported_transactions').update({
      match_status: 'needs_review',
      matched_order_id: null,
      updated_at: new Date().toISOString(),
    }).eq('id', transactionId);
    if (error) {
      reviewUpdateFailures += 1;
      console.error(`Imported transaction ${transactionId} could not be marked for review:`, error.message);
      return;
    }
    needsReview += 1;
  };

  for (const tx of (transactions || []) as ImportedTransaction[]) {
    const ranked = ((orders || []) as CandidateOrder[])
      .map((order) => ({ order, score: scoreOrderMatch(order, tx) }))
      // Amount-only auto reconciliation is permitted only for the exact
      // balance still due. References and names can raise confidence, but
      // can never override an amount mismatch.
      .filter((entry) => isExactBalanceMatch(entry.order, tx) && entry.score >= 40)
      .sort((a, b) => b.score - a.score);

    const hasUniqueConfidentMatch = ranked.length === 1 && ranked[0].score >= 55;
    const hasDominantReferenceMatch = ranked.length > 1
      && ranked[0].score >= 120
      && ranked[0].score - ranked[1].score >= 30;
    if (hasUniqueConfidentMatch || hasDominantReferenceMatch) {
      const best = ranked[0].order;
      const { data: recorded, error: recordError } = await supabase.rpc('confirm_imported_order_payment', {
        target_transaction_id: tx.id,
        target_order_id: best.id,
        target_confirmed_by: user.id,
        target_notes: 'Auto-matched by reconciliation job',
      });
      const payment = recorded?.[0];
      if (recordError || !payment?.payment_id) {
        await markNeedsReview(tx.id);
        continue;
      }

      const queuedReceipt = await enqueuePaymentReceiptJob(supabase, 'order_payment', payment.payment_id);
      if (!queuedReceipt.ok) {
        console.error(`Auto-matched payment receipt for order ${best.id} could not be queued:`, queuedReceipt.reason);
      } else {
        const receiptAttempt = await attemptPaymentReceiptDelivery(supabase, queuedReceipt.jobId);
        if (receiptAttempt.status === 'claim_failed' || receiptAttempt.status === 'completion_failed') {
          console.error(`Auto-matched payment receipt for order ${best.id} could not be attempted:`, receiptAttempt.reason);
        }
      }
      const staffNotification = await sendPaidStaffOrderNotificationForPayment(
        supabase,
        { id: payment.payment_id },
        best.id,
      );
      if (staffNotification.status === 'failed') {
        console.error(`Auto-matched paid staff notification for order ${best.id} failed:`, staffNotification.reason);
      }

      autoMatched += 1;
    } else {
      await markNeedsReview(tx.id);
    }
  }

  if (reviewUpdateFailures > 0) {
    return NextResponse.json(
      {
        success: false,
        error: 'Some payment mismatches could not be placed in the review queue. Re-run reconciliation.',
        autoMatched,
        needsReview,
        reviewUpdateFailures,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, autoMatched, needsReview });
}

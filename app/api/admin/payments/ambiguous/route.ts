import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/auth/guard';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
import { isPaymentOperationUuid, MANUAL_PAYMENT_LIMITS } from '@/lib/payments/manual-payment';
import { attemptPaymentReceiptDelivery, enqueuePaymentReceiptJob } from '@/lib/payments/receipt-delivery';
import { sendPaidStaffOrderNotificationForPayment } from '@/lib/order-notifications';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requirePermission('payments', ['admin']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('imported_transactions')
    .select('id, payer_name, transaction_reference, amount, transaction_date, matched_order_id')
    .eq('match_status', 'needs_review')
    .order('transaction_date', { ascending: false });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, transactions: data || [] });
}

export async function POST(request: Request) {
  const user = await requirePermission('payments', ['admin']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const rawBody = await readLimitedJsonObject(request, 16 * 1024);
  if (!rawBody.ok) return NextResponse.json({ success: false, error: rawBody.error }, { status: 400 });
  const { transaction_id, order_id, notes } = rawBody.value;
  if (!isPaymentOperationUuid(transaction_id) || !isPaymentOperationUuid(order_id)) {
    return NextResponse.json({ success: false, error: 'Valid transaction_id and order_id values are required.' }, { status: 400 });
  }
  if (notes !== undefined && typeof notes !== 'string') {
    return NextResponse.json({ success: false, error: 'Notes must be text.' }, { status: 400 });
  }
  const cleanNotes = typeof notes === 'string' ? notes.trim() : '';
  if (cleanNotes.length > MANUAL_PAYMENT_LIMITS.notesLength) {
    return NextResponse.json({ success: false, error: 'Notes are too long.' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase.rpc('confirm_imported_order_payment', {
    target_transaction_id: transaction_id,
    target_order_id: order_id,
    target_confirmed_by: user.id,
    target_notes: cleanNotes || 'Confirmed from ambiguous queue',
  });
  const payment = data?.[0];
  if (error || !payment?.payment_id) {
    return NextResponse.json({ success: false, error: 'The imported payment could not be recorded atomically.' }, { status: 409 });
  }

  const queuedReceipt = await enqueuePaymentReceiptJob(supabase, 'order_payment', payment.payment_id);
  let customerReceiptStatus = 'queue_failed';
  if (!queuedReceipt.ok) {
    console.error(`Imported payment receipt for order ${order_id} could not be queued:`, queuedReceipt.reason);
  } else {
    const receiptAttempt = await attemptPaymentReceiptDelivery(supabase, queuedReceipt.jobId);
    customerReceiptStatus = receiptAttempt.status;
    if (receiptAttempt.status === 'claim_failed' || receiptAttempt.status === 'completion_failed') {
      console.error(`Imported payment receipt for order ${order_id} could not be attempted:`, receiptAttempt.reason);
    }
  }
  const staffNotification = await sendPaidStaffOrderNotificationForPayment(
    supabase,
    { id: payment.payment_id },
    order_id,
  );
  if (staffNotification.status === 'failed') {
    console.error(`Imported paid staff notification for order ${order_id} failed:`, staffNotification.reason);
  }
  return NextResponse.json({
    success: true,
    payment_reference: payment.payment_reference,
    customer_receipt_status: customerReceiptStatus,
    staff_notification_status: staffNotification.status,
  });
}

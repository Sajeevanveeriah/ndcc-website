import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/auth/guard';
import { sendPaidStaffOrderNotificationForPayment } from '@/lib/order-notifications';
import { generateUniquePaymentReference, normalisePaymentReferenceCategory } from '@/lib/payments/reference';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
import {
  isPaymentOperationUuid,
  MANUAL_PAYMENT_LIMITS,
  parsePositiveAudCents,
} from '@/lib/payments/manual-payment';
import { attemptPaymentReceiptDelivery, enqueuePaymentReceiptJob } from '@/lib/payments/receipt-delivery';

export const dynamic = 'force-dynamic';

const MANUAL_METHODS = ['bank_transfer', 'cash', 'other'] as const;

export async function GET(request: Request) {
  const user = await requirePermission('orders');
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get('order_id');

  const supabase = createServerClient();
  let query = supabase
    .from('order_payments')
    .select('id,order_id,payment_reference,client_operation_id,amount,currency,method,provider,provider_reference,status,received_at,recorded_by,notes,reverses_payment_id,created_at')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (orderId) query = query.eq('order_id', orderId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: data ?? [] });
}

export async function POST(request: Request) {
  const user = await requirePermission('orders', ['admin']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const rawBody = await readLimitedJsonObject(request, 16 * 1024);
  if (!rawBody.ok) {
    return NextResponse.json({ success: false, error: rawBody.error }, { status: 400 });
  }
  const body = rawBody.value;
  const supabase = createServerClient();
  const recordedBy = user.email || user.id || 'committee-admin';
  if (body.notes !== undefined && typeof body.notes !== 'string') {
    return NextResponse.json({ success: false, error: 'Notes must be text.' }, { status: 400 });
  }
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  if (notes.length > MANUAL_PAYMENT_LIMITS.notesLength) {
    return NextResponse.json({ success: false, error: 'Notes are too long.' }, { status: 400 });
  }

  if (typeof body.void_payment_id === 'string' && body.void_payment_id) {
    const { data: target, error: findError } = await supabase
      .from('order_payments')
      .select('id,status,provider')
      .eq('id', body.void_payment_id)
      .maybeSingle();
    if (findError || !target) return NextResponse.json({ success: false, error: 'Payment not found.' }, { status: 404 });
    if (target.status !== 'pending' && target.status !== 'failed') {
      return NextResponse.json(
        { success: false, error: 'Only pending or failed payments can be voided. Use a reversal for settled payments.' },
        { status: 400 }
      );
    }
    if (target.provider === 'stripe') {
      return NextResponse.json(
        { success: false, error: 'Stripe payment attempts cannot be voided manually. Let their verified Stripe lifecycle close them.' },
        { status: 409 }
      );
    }
    const { data, error } = await supabase
      .from('order_payments')
      .update({ status: 'void', notes: notes || undefined, recorded_by: recordedBy })
      .eq('id', target.id)
      .select()
      .single();
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data });
  }

  if (typeof body.reverses_payment_id === 'string' && body.reverses_payment_id) {
    const { data: original, error: findError } = await supabase
      .from('order_payments')
      .select('id,order_id,amount,method,provider,status')
      .eq('id', body.reverses_payment_id)
      .maybeSingle();
    if (findError || !original) return NextResponse.json({ success: false, error: 'Payment not found.' }, { status: 404 });
    if (original.status !== 'settled') {
      return NextResponse.json({ success: false, error: 'Only settled payments can be reversed.' }, { status: 400 });
    }
    if (original.provider === 'stripe') {
      return NextResponse.json(
        { success: false, error: 'Stripe payments must be refunded in Stripe and confirmed by the signed webhook.' },
        { status: 409 }
      );
    }
    const { data: existingReversal, error: existingReversalError } = await supabase
      .from('order_payments')
      .select('id')
      .eq('reverses_payment_id', original.id)
      .eq('status', 'refunded')
      .maybeSingle();
    if (existingReversalError) {
      return NextResponse.json(
        { success: false, error: 'Could not verify the payment reversal state.' },
        { status: 500 },
      );
    }
    if (existingReversal) {
      return NextResponse.json({ success: false, error: 'This payment has already been reversed.' }, { status: 409 });
    }
    const { data: reversalOrder, error: reversalOrderError } = await supabase
      .from('orders')
      .select('order_category')
      .eq('id', original.order_id)
      .maybeSingle();
    if (reversalOrderError || !reversalOrder) {
      return NextResponse.json(
        { success: false, error: 'Could not verify the payment category.' },
        { status: 500 },
      );
    }
    const paymentReference = await generateUniquePaymentReference(
      normalisePaymentReferenceCategory(reversalOrder.order_category)
    );
    const { data, error } = await supabase
      .from('order_payments')
      .insert({
        order_id: original.order_id,
        payment_reference: paymentReference,
        amount: original.amount,
        method: original.method,
        status: 'refunded',
        reverses_payment_id: original.id,
        received_at: new Date().toISOString(),
        recorded_by: recordedBy,
        notes: notes || 'Reversal of recorded payment',
      })
      .select()
      .single();
    if (error?.code === '23505') {
      return NextResponse.json({ success: false, error: 'This payment has already been reversed.' }, { status: 409 });
    }
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data });
  }

  const orderId = typeof body.order_id === 'string' ? body.order_id.trim() : '';
  const amountCents = parsePositiveAudCents(body.amount_cents);
  const method = typeof body.method === 'string' ? body.method : '';
  const operationId = body.client_operation_id;
  if (!isPaymentOperationUuid(orderId)) {
    return NextResponse.json({ success: false, error: 'A valid order_id is required.' }, { status: 400 });
  }
  if (!isPaymentOperationUuid(operationId)) {
    return NextResponse.json({ success: false, error: 'A valid client_operation_id is required.' }, { status: 400 });
  }
  if (amountCents === null) {
    return NextResponse.json({ success: false, error: 'Amount must be a positive whole number of AUD cents.' }, { status: 400 });
  }
  if (!(MANUAL_METHODS as readonly string[]).includes(method)) {
    return NextResponse.json(
      { success: false, error: `Method must be one of: ${MANUAL_METHODS.join(', ')}. Card payments arrive via the Stripe webhook.` },
      { status: 400 }
    );
  }

  if (body.provider_reference !== undefined && typeof body.provider_reference !== 'string') {
    return NextResponse.json({ success: false, error: 'Provider reference must be text.' }, { status: 400 });
  }
  const providerReference = typeof body.provider_reference === 'string' ? body.provider_reference.trim() : '';
  if (providerReference.length > MANUAL_PAYMENT_LIMITS.providerReferenceLength) {
    return NextResponse.json({ success: false, error: 'Provider reference is too long.' }, { status: 400 });
  }
  let receivedAt: string | null = null;
  if (body.received_at !== undefined && body.received_at !== null && body.received_at !== '') {
    if (typeof body.received_at !== 'string' || body.received_at.length > 40) {
      return NextResponse.json({ success: false, error: 'Payment date is invalid.' }, { status: 400 });
    }
    const parsedReceivedAt = new Date(body.received_at);
    if (Number.isNaN(parsedReceivedAt.getTime())) {
      return NextResponse.json({ success: false, error: 'Payment date is invalid.' }, { status: 400 });
    }
    receivedAt = parsedReceivedAt.toISOString();
  }

  const recordedResult = await supabase.rpc('record_manual_order_payment', {
    target_order_id: orderId,
    target_operation_id: operationId,
    target_amount_cents: amountCents,
    target_method: method,
    target_recorded_by: recordedBy,
    target_received_at: receivedAt,
    target_notes: notes,
    target_provider_reference: providerReference || null,
  });
  const recorded = recordedResult.data?.[0];
  if (recordedResult.error || !recorded?.payment_id) {
    console.error('Atomic manual payment failed:', recordedResult.error);
    return NextResponse.json(
      { success: false, error: 'The payment could not be recorded. Check the unreserved balance and try again.' },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from('order_payments')
    .select('id,order_id,payment_reference,client_operation_id,amount,currency,method,provider,provider_reference,status,received_at,recorded_by,notes,reverses_payment_id,metadata,created_at')
    .eq('id', recorded.payment_id)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ success: false, error: 'The recorded payment could not be reloaded.' }, { status: 500 });
  }

  const { data: updatedOrder } = await supabase
    .from('orders')
    .select('id,amount_paid,balance_due,payment_status,order_status,needs_review_reason')
    .eq('id', orderId)
    .maybeSingle();

  let staffNotificationStatus: string | null = null;
  const queuedReceipt = await enqueuePaymentReceiptJob(supabase, 'order_payment', data.id);
  let customerReceiptStatus = 'queue_failed';
  if (!queuedReceipt.ok) {
    console.error(`Manual payment receipt for order ${orderId} could not be queued:`, queuedReceipt.reason);
  } else {
    const receiptAttempt = await attemptPaymentReceiptDelivery(supabase, queuedReceipt.jobId);
    customerReceiptStatus = receiptAttempt.status;
    if (receiptAttempt.status === 'claim_failed' || receiptAttempt.status === 'completion_failed') {
      console.error(`Manual payment receipt for order ${orderId} could not be attempted:`, receiptAttempt.reason);
    }
  }
  if (updatedOrder?.payment_status === 'paid') {
    const notification = await sendPaidStaffOrderNotificationForPayment(
      supabase,
      { id: data.id, metadata: data.metadata || null },
      orderId,
    );
    staffNotificationStatus = notification.status;
    if (notification.status === 'failed') {
      console.error(`Manual payment staff notification for order ${orderId} failed:`, notification.reason);
    }
  }

  return NextResponse.json({
    success: true,
    data,
    order: updatedOrder ?? null,
    replayed: Boolean(recorded.replayed),
    customer_receipt_status: customerReceiptStatus,
    staff_notification_status: staffNotificationStatus,
  });
}

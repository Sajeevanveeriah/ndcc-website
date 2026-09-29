import 'server-only';

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendPaidStaffOrderNotificationForPayment } from '@/lib/order-notifications';
import { attemptPaymentReceiptDelivery, enqueuePaymentReceiptJob } from '@/lib/payments/receipt-delivery';

export type KitchenPaymentResult =
  | { ok: true; alreadyPaid: boolean; customerReceiptStatus: string | null; staffNotificationStatus: string | null }
  | { ok: false; status: number; error: string };

type LinkedOrder = {
  id: string; total_amount: number | string | null; amount_paid: number | string | null; balance_due: number | string | null;
  payment_status: string | null; order_status: string | null; deleted_at: string | null;
};

async function loadLinkedOrder(supabase: SupabaseClient, orderId: string) {
  return supabase.from('orders')
    .select('id,total_amount,amount_paid,balance_due,payment_status,order_status,deleted_at')
    .eq('id', orderId).maybeSingle<LinkedOrder>();
}

/**
 * "Mark Paid" on the Kitchen page for an online order: records the unpaid
 * balance as a cash payment in the order ledger, the same sequence as a
 * manual payment in Admin > Orders (record_manual_order_payment, customer
 * receipt with the staff copy, then the staff paid email). The linked kitchen
 * list row follows through the orders payment-status trigger.
 */
export async function markKitchenOrderPaid(supabase: SupabaseClient, orderId: string, recordedBy: string): Promise<KitchenPaymentResult> {
  const { data: order, error } = await loadLinkedOrder(supabase, orderId);
  if (error) return { ok: false, status: 503, error: 'Could not load the order. Please retry.' };
  if (!order || order.deleted_at) return { ok: false, status: 404, error: 'The linked order was not found.' };
  if (order.order_status === 'cancelled') return { ok: false, status: 409, error: 'This order is cancelled.' };
  const balance = order.balance_due ?? Number(order.total_amount ?? 0) - Number(order.amount_paid ?? 0);
  const amountCents = Math.round(Number(balance) * 100);
  if (order.payment_status === 'paid' || !Number.isFinite(amountCents) || amountCents <= 0) {
    return { ok: true, alreadyPaid: true, customerReceiptStatus: null, staffNotificationStatus: null };
  }

  // A second click finds no unreserved balance and is refused by the ledger, so it cannot pay twice.
  const recorded = await supabase.rpc('record_manual_order_payment', {
    target_order_id: order.id,
    target_operation_id: randomUUID(),
    target_amount_cents: amountCents,
    target_method: 'cash',
    target_recorded_by: recordedBy,
    target_received_at: null,
    target_notes: 'Marked paid on the Kitchen page (cash)',
    target_provider_reference: null,
  });
  const paymentId = recorded.data?.[0]?.payment_id as string | undefined;
  if (recorded.error || !paymentId) {
    console.error('Kitchen mark-paid payment failed:', recorded.error);
    return { ok: false, status: 409, error: 'The payment could not be recorded. Refresh the orders and try again.' };
  }

  let customerReceiptStatus = 'queue_failed';
  const queued = await enqueuePaymentReceiptJob(supabase, 'order_payment', paymentId);
  if (queued.ok) customerReceiptStatus = (await attemptPaymentReceiptDelivery(supabase, queued.jobId)).status;
  else console.error(`Kitchen mark-paid receipt for order ${order.id} could not be queued:`, queued.reason);

  let staffNotificationStatus: string | null = null;
  const { data: updated } = await loadLinkedOrder(supabase, order.id);
  if (updated?.payment_status === 'paid') {
    const { data: payment } = await supabase.from('order_payments').select('id,metadata').eq('id', paymentId).maybeSingle();
    const notification = await sendPaidStaffOrderNotificationForPayment(supabase, { id: paymentId, metadata: payment?.metadata ?? null }, order.id);
    staffNotificationStatus = notification.status;
  }
  return { ok: true, alreadyPaid: false, customerReceiptStatus, staffNotificationStatus };
}

/** "Mark Unpaid" never erases a recorded payment; those are reversed in Admin > Orders. */
export async function checkKitchenOrderUnpaid(supabase: SupabaseClient, orderId: string): Promise<KitchenPaymentResult> {
  const { data: order, error } = await loadLinkedOrder(supabase, orderId);
  if (error) return { ok: false, status: 503, error: 'Could not load the order. Please retry.' };
  if (!order) return { ok: false, status: 404, error: 'The linked order was not found.' };
  if (order.payment_status === 'paid' || Number(order.amount_paid ?? 0) > 0) {
    return { ok: false, status: 409, error: 'This order has a recorded payment. Reverse it in Admin > Orders.' };
  }
  return { ok: true, alreadyPaid: false, customerReceiptStatus: null, staffNotificationStatus: null };
}

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { emailHtml, sendEmail } from '@/lib/email';
import {
  buildStaffOrderNotificationContent,
  type StaffOrderCategory,
  type StaffOrderItem,
  type StaffOrderNotificationStage,
} from '@/lib/order-notification-content';

export type StaffOrderNotificationResult =
  | { status: 'sent'; id?: string }
  | { status: 'simulated'; reason: string }
  | { status: 'already_sent'; reason: string }
  | { status: 'not_applicable'; reason: string }
  | { status: 'failed'; reason: string };

type PaymentMarker = {
  id: string;
  metadata?: Record<string, unknown> | null;
};

type PaidPaymentIdentity = {
  paymentReference?: string;
  bankReference?: string;
};

function categoryFromOrder(value: unknown): StaffOrderCategory | null {
  if (value === 'merch') return 'apparel';
  if (value === 'kitchen') return 'kitchen';
  return null;
}

export async function sendStaffOrderNotificationForOrder(
  supabase: SupabaseClient,
  orderId: string,
  stage: StaffOrderNotificationStage,
  paidPayment: PaidPaymentIdentity = {},
): Promise<StaffOrderNotificationResult> {
  const { data: order, error } = await supabase
    .from('orders')
    .select('id,customer_name,customer_email,customer_phone,items,total_amount,payment_status,payment_reference,bank_reference_used,order_category')
    .eq('id', orderId)
    .maybeSingle();

  if (error) return { status: 'failed', reason: `Unable to load order for notification: ${error.message}` };
  if (!order) return { status: 'failed', reason: 'Order not found for staff notification.' };

  const category = categoryFromOrder(order.order_category);
  if (!category) return { status: 'not_applicable', reason: 'Order category does not require a staff notification.' };
  if (stage === 'paid' && order.payment_status !== 'paid') {
    return { status: 'not_applicable', reason: 'Order is not fully paid.' };
  }

  const content = buildStaffOrderNotificationContent({
    orderId: order.id,
    paymentReference: paidPayment.paymentReference || order.payment_reference || order.id,
    orderReference: order.payment_reference || order.id,
    bankReference: paidPayment.bankReference || order.bank_reference_used || undefined,
    category,
    stage,
    paymentMade: stage === 'paid',
    customer: {
      name: order.customer_name || '',
      email: order.customer_email || '',
      phone: order.customer_phone || '',
    },
    items: Array.isArray(order.items) ? (order.items as StaffOrderItem[]) : [],
    totalAmount: Number(order.total_amount || 0),
  });

  const result = await sendEmail({
    to: content.recipients,
    replyTo: order.customer_email || undefined,
    subject: content.subject,
    html: emailHtml(content.title, content.bodyHtml),
    idempotencyKey: content.idempotencyKey,
    tags: [
      { name: 'category', value: 'staff-order' },
      { name: 'order-type', value: category },
      { name: 'payment-made', value: content.paymentMadeLabel.toLowerCase() },
    ],
  });

  if (result.status === 'sent' || result.status === 'simulated') return result;
  return { status: 'failed', reason: result.reason };
}

export async function sendPaidStaffOrderNotificationForPayment(
  supabase: SupabaseClient,
  payment: PaymentMarker,
  orderId: string,
): Promise<StaffOrderNotificationResult> {
  // Kept as a compatibility entry point for existing settlement callers.
  // The receipt outbox owns the single customer + club message for every payment.
  void supabase; void payment; void orderId;
  return { status: 'not_applicable', reason: 'Staff recipients are included in the queued payment receipt.' };
}

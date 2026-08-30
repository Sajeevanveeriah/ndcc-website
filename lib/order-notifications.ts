import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { emailHtml, sendEmail } from '@/lib/email';
import { getPaymentMetadata, mergePaymentMetadata } from '@/lib/payment-metadata';
import {
  buildStaffOrderNotificationContent,
  type StaffOrderCategory,
  type StaffOrderItem,
  type StaffOrderNotificationStage,
} from '@/lib/order-notification-content';

const PAID_NOTIFICATION_SENT_AT = 'staff_paid_notification_sent_at';
const PAID_NOTIFICATION_MESSAGE_ID = 'staff_paid_notification_message_id';

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

function isSentResult(
  result: StaffOrderNotificationResult,
): result is Extract<StaffOrderNotificationResult, { status: 'sent' | 'simulated' }> {
  return result.status === 'sent' || result.status === 'simulated';
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
  const current = await getPaymentMetadata(supabase, payment.id);
  if (current.error) return { status: 'failed', reason: current.error };
  const metadata = current.metadata;
  if (typeof metadata[PAID_NOTIFICATION_SENT_AT] === 'string') {
    return { status: 'already_sent', reason: 'Paid staff notification was already recorded.' };
  }

  const { data: paymentIdentity, error: paymentError } = await supabase
    .from('order_payments')
    .select('payment_reference,method,provider,provider_reference')
    .eq('id', payment.id)
    .maybeSingle();
  if (paymentError || !paymentIdentity) {
    return { status: 'failed', reason: paymentError?.message || 'Payment identity was not found for staff notification.' };
  }
  const metadataBankReference = typeof metadata.bank_reference === 'string'
    ? metadata.bank_reference.trim()
    : '';
  const providerBankReference = paymentIdentity.method === 'bank_transfer'
    && paymentIdentity.provider !== 'bank_import'
    && typeof paymentIdentity.provider_reference === 'string'
    ? paymentIdentity.provider_reference.trim()
    : '';
  const result = await sendStaffOrderNotificationForOrder(supabase, orderId, 'paid', {
    paymentReference: paymentIdentity.payment_reference || undefined,
    bankReference: metadataBankReference || providerBankReference || undefined,
  });
  if (!isSentResult(result)) return result;

  const marker: Record<string, unknown> = {
    [PAID_NOTIFICATION_SENT_AT]: new Date().toISOString(),
  };
  if (result.status === 'sent' && result.id) marker[PAID_NOTIFICATION_MESSAGE_ID] = result.id;

  const marked = await mergePaymentMetadata(supabase, payment.id, marker);
  if (!marked.ok) {
    return {
      status: 'failed',
      reason: marked.reason,
    };
  }

  return result;
}

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { emailHtml, sendEmail } from '@/lib/email';
import { getPaymentMetadata, mergePaymentMetadata } from '@/lib/payment-metadata';
import {
  buildPaymentReceiptFilename,
  buildPaymentReceiptPdf,
} from '@/lib/payment-receipt-pdf';

const RECEIPT_SENT_AT = 'customer_receipt_sent_at';
const RECEIPT_MESSAGE_ID = 'customer_receipt_message_id';
const RECEIPT_FILENAME = 'customer_receipt_filename';

export type PaymentReceiptSendResult =
  | { status: 'sent'; id?: string }
  | { status: 'simulated'; reason: string }
  | { status: 'already_sent'; reason: string }
  | { status: 'failed'; reason: string };

type OrderItem = {
  name?: unknown;
  quantity?: unknown;
  size?: unknown;
  applied_options?: unknown;
};

const CATEGORY_LABELS: Record<string, string> = {
  merch: 'Merchandise',
  kitchen: 'Kitchen Order',
  membership: 'Social Membership',
  event: 'Event Registration',
};

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character] || character));
}

function itemDescription(item: OrderItem): string {
  const quantity = Math.max(1, Math.round(Number(item.quantity) || 1));
  const name = String(item.name || 'Club payment').trim();
  const details: string[] = [];
  const size = typeof item.size === 'string' ? item.size.trim() : '';
  if (size && size !== 'kitchen') details.push(size);
  if (Array.isArray(item.applied_options)) {
    for (const option of item.applied_options) {
      if (!option || typeof option !== 'object') continue;
      const label = 'label' in option ? String(option.label ?? '').trim() : '';
      if (label) details.push(label);
    }
  }
  return `${quantity} x ${name}${details.length > 0 ? ` (${details.join(', ')})` : ''}`;
}

function descriptions(items: unknown, paymentKind: unknown): string[] {
  const list = Array.isArray(items) ? (items as OrderItem[]) : [];
  const lines = list.slice(0, 4).map(itemDescription);
  if (list.length > 4) lines.push(`Plus ${list.length - 4} more item${list.length - 4 === 1 ? '' : 's'}`);
  if (lines.length === 0) lines.push('Website payment');
  if (paymentKind === 'partial') lines.unshift('Part payment');
  return lines;
}

export async function sendOrderPaymentReceiptForPayment(
  supabase: SupabaseClient,
  paymentId: string,
  orderId: string,
): Promise<PaymentReceiptSendResult> {
  const current = await getPaymentMetadata(supabase, paymentId);
  if (current.error) return { status: 'failed', reason: current.error };
  if (typeof current.metadata[RECEIPT_SENT_AT] === 'string') {
    return { status: 'already_sent', reason: 'Customer payment receipt was already recorded.' };
  }

  const [{ data: payment, error: paymentError }, { data: order, error: orderError }] = await Promise.all([
    supabase
      .from('order_payments')
      .select('id,amount,received_at,status,method,metadata')
      .eq('id', paymentId)
      .maybeSingle(),
    supabase
      .from('orders')
      .select('id,customer_name,customer_email,items,payment_reference,order_category')
      .eq('id', orderId)
      .maybeSingle(),
  ]);
  if (paymentError || !payment) return { status: 'failed', reason: paymentError?.message || 'Payment was not found.' };
  if (orderError || !order) return { status: 'failed', reason: orderError?.message || 'Order was not found.' };
  if (payment.status !== 'settled' || !payment.received_at) {
    return { status: 'failed', reason: 'A receipt can only be sent for a settled payment.' };
  }
  if (!String(order.customer_email || '').trim()) {
    return { status: 'failed', reason: 'The purchaser email address is missing.' };
  }

  const amountCents = Math.round(Number(payment.amount) * 100);
  const reference = String(order.payment_reference || order.id);
  const category = String(order.order_category || '').toLowerCase();
  const receiptData = {
    purchaserName: String(order.customer_name || 'Purchaser'),
    purchaserEmail: String(order.customer_email),
    paymentDate: String(payment.received_at),
    amountCents,
    paymentType: CATEGORY_LABELS[category] || 'Club Payment',
    paymentMethod: payment.method === 'stripe' ? 'Stripe Checkout' : String(payment.method || 'Website payment'),
    reference,
    descriptionLines: descriptions(order.items, (payment.metadata || {}).payment_kind),
  };
  const [pdf, filename] = await Promise.all([
    buildPaymentReceiptPdf(receiptData),
    Promise.resolve(buildPaymentReceiptFilename(receiptData)),
  ]);
  const result = await sendEmail({
    to: order.customer_email,
    subject: `Your NDCC payment receipt - ${reference}`,
    html: emailHtml('Payment received', `<p>Hi ${escapeHtml(order.customer_name || 'there')},</p><p>Thank you. Stripe has confirmed your payment of <strong>$${(amountCents / 100).toFixed(2)} AUD</strong> for ${escapeHtml(receiptData.paymentType.toLowerCase())}.</p><p>Your payment receipt is attached as a PDF. Please keep it with your payment record.</p><p><strong>Payment reference:</strong> ${escapeHtml(reference)}</p>`),
    idempotencyKey: `website-payment-receipt-${paymentId}`,
    tags: [
      { name: 'category', value: 'customer-receipt' },
      { name: 'payment-type', value: category || 'general' },
    ],
    attachments: [{ filename, content: pdf, contentType: 'application/pdf' }],
  });
  if (result.status !== 'sent' && result.status !== 'simulated') {
    return { status: 'failed', reason: result.reason };
  }

  const marker: Record<string, unknown> = {
    [RECEIPT_SENT_AT]: new Date().toISOString(),
    [RECEIPT_FILENAME]: filename,
  };
  if (result.status === 'sent' && result.id) marker[RECEIPT_MESSAGE_ID] = result.id;
  const marked = await mergePaymentMetadata(supabase, paymentId, marker);
  if (!marked.ok) return { status: 'failed', reason: marked.reason };
  return result;
}

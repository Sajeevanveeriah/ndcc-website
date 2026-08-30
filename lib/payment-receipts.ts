import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { emailHtml, getTransactionalReplyTo, sendEmail } from '@/lib/email';
import { getPaymentMetadata, mergePaymentMetadata } from '@/lib/payment-metadata';
import { canRecordSimulatedReceiptDelivery } from '@/lib/payments/receipt-delivery-policy';
import {
  isCanonicalPaymentReference,
  normalisePaymentReferenceCategory,
} from '@/lib/payments/reference';
import {
  buildPaymentReceiptFilename,
  buildPaymentReceiptPdf,
} from '@/lib/payment-receipt-pdf';

const RECEIPT_SENT_AT = 'customer_receipt_sent_at';
const RECEIPT_MESSAGE_ID = 'customer_receipt_message_id';
const RECEIPT_FILENAME = 'customer_receipt_filename';

export type PaymentReceiptSendResult =
  | { status: 'sent'; id?: string; filename?: string }
  | { status: 'sent_unrecorded'; reason: string; id?: string; filename: string }
  | { status: 'simulated'; reason: string; filename?: string }
  | { status: 'already_sent'; reason: string; id?: string; filename?: string }
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

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  stripe: 'Stripe Checkout',
  bank_transfer: 'Bank Transfer',
  cash: 'Cash',
  other: 'Other',
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
  options: { issuedAt?: string } = {},
): Promise<PaymentReceiptSendResult> {
  const current = await getPaymentMetadata(supabase, paymentId);
  if (current.error) return { status: 'failed', reason: current.error };
  if (typeof current.metadata[RECEIPT_SENT_AT] === 'string') {
    return {
      status: 'already_sent',
      reason: 'Customer payment receipt was already recorded.',
      id: typeof current.metadata[RECEIPT_MESSAGE_ID] === 'string'
        ? current.metadata[RECEIPT_MESSAGE_ID]
        : undefined,
      filename: typeof current.metadata[RECEIPT_FILENAME] === 'string'
        ? current.metadata[RECEIPT_FILENAME]
        : undefined,
    };
  }

  const [{ data: payment, error: paymentError }, { data: order, error: orderError }] = await Promise.all([
    supabase
      .from('order_payments')
      .select('id,amount,currency,received_at,status,method,provider,provider_reference,payment_reference,metadata')
      .eq('id', paymentId)
      .maybeSingle(),
    supabase
      .from('orders')
      .select('id,customer_name,customer_email,items,payment_reference,bank_reference_used,order_category')
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
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    return { status: 'failed', reason: 'The settled payment amount is invalid.' };
  }
  if (String(payment.currency || '').toUpperCase() !== 'AUD') {
    return { status: 'failed', reason: 'The settled payment is not recorded in AUD.' };
  }
  const category = normalisePaymentReferenceCategory(order.order_category);
  const reference = String(payment.payment_reference || '').trim();
  if (!isCanonicalPaymentReference(reference, category)) {
    return {
      status: 'failed',
      reason: 'The settled payment does not have a canonical category payment reference.',
    };
  }
  const orderReference = String(order.payment_reference || order.id);
  const paymentMetadata = payment.metadata && typeof payment.metadata === 'object'
    ? payment.metadata as Record<string, unknown>
    : {};
  const paymentIntent = typeof paymentMetadata.payment_intent === 'string'
    ? paymentMetadata.payment_intent.trim()
    : '';
  if (payment.method === 'stripe' && !/^pi_[A-Za-z0-9_]+$/.test(paymentIntent)) {
    return { status: 'failed', reason: 'The Stripe payment intent is missing or invalid.' };
  }
  if (paymentIntent) {
    const pending = await supabase
      .from('stripe_payment_events')
      .select('provider_event_id')
      .eq('payment_intent_id', paymentIntent)
      .eq('payment_domain', 'pending')
      .limit(1)
      .maybeSingle();
    if (pending.error) return { status: 'failed', reason: pending.error.message };
    if (pending.data) {
      return {
        status: 'failed',
        reason: 'The order payment still has a deferred financial event to replay.',
      };
    }
  }
  const metadataBankReference = typeof paymentMetadata.bank_reference === 'string'
    ? paymentMetadata.bank_reference.trim()
    : '';
  const providerBankReference = payment.method === 'bank_transfer'
    && payment.provider !== 'bank_import'
    && typeof payment.provider_reference === 'string'
    ? payment.provider_reference.trim()
    : '';
  const bankReference = metadataBankReference
    || providerBankReference
    || String(order.bank_reference_used || '').trim();
  const referenceDescriptions: string[] = [];
  if (orderReference !== reference) referenceDescriptions.push(`Order / bank reference: ${orderReference}`);
  if (bankReference && bankReference !== orderReference && bankReference !== reference) {
    referenceDescriptions.push(`Bank statement reference: ${bankReference}`);
  }
  const receiptData = {
    purchaserName: String(order.customer_name || 'Purchaser'),
    purchaserEmail: String(order.customer_email),
    paymentDate: String(payment.received_at),
    issuedDate: options.issuedAt || String(payment.received_at),
    amountCents,
    paymentType: CATEGORY_LABELS[category] || 'Club Payment',
    paymentMethod: PAYMENT_METHOD_LABELS[payment.method] || 'Website Payment',
    reference,
    descriptionLines: [
      ...referenceDescriptions,
      ...descriptions(order.items, paymentMetadata.payment_kind),
    ],
  };
  const [pdf, filename] = await Promise.all([
    buildPaymentReceiptPdf(receiptData),
    Promise.resolve(buildPaymentReceiptFilename(receiptData)),
  ]);
  const result = await sendEmail({
    to: order.customer_email,
    replyTo: getTransactionalReplyTo(),
    subject: `Your NDCC payment receipt - ${reference}`,
    html: emailHtml('Payment received', `<p>Hi ${escapeHtml(order.customer_name || 'there')},</p><p>Thank you. We have recorded your payment of <strong>$${(amountCents / 100).toFixed(2)} AUD</strong> for ${escapeHtml(receiptData.paymentType.toLowerCase())}.</p><p>Your payment receipt is attached as a PDF. Please keep it with your payment record.</p><p><strong>Payment reference:</strong> ${escapeHtml(reference)}<br><strong>Order / bank reference:</strong> ${escapeHtml(orderReference)}${bankReference && bankReference !== orderReference && bankReference !== reference ? `<br><strong>Bank statement reference:</strong> ${escapeHtml(bankReference)}` : ''}</p>`),
    idempotencyKey: `website-payment-receipt-${paymentId}`,
    tags: [
      { name: 'category', value: 'customer-receipt' },
      { name: 'payment-type', value: category },
    ],
    attachments: [{ filename, content: pdf, contentType: 'application/pdf' }],
  });
  if (result.status !== 'sent' && result.status !== 'simulated') {
    return { status: 'failed', reason: result.reason };
  }
  if (result.status === 'simulated' && !canRecordSimulatedReceiptDelivery()) {
    return {
      status: 'failed',
      reason: 'EMAIL_TEST_MODE cannot complete a customer receipt in production.',
    };
  }

  const marker: Record<string, unknown> = {
    [RECEIPT_SENT_AT]: new Date().toISOString(),
    [RECEIPT_FILENAME]: filename,
  };
  if (result.status === 'sent' && result.id) marker[RECEIPT_MESSAGE_ID] = result.id;
  const marked = await mergePaymentMetadata(supabase, paymentId, marker);
  if (!marked.ok) {
    if (result.status === 'sent') {
      return {
        status: 'sent_unrecorded',
        reason: marked.reason,
        id: result.id,
        filename,
      };
    }
    return { status: 'failed', reason: marked.reason };
  }
  return { ...result, filename };
}

import 'server-only';
import { receiptRecipients } from '@/lib/payments/receipt-recipients';
import { createServerClient } from '@/lib/supabase-server';
import { emailHtml, getTransactionalReplyTo, sendEmail } from '@/lib/email';
import { buildPaymentReceiptFilename, buildPaymentReceiptPdf } from '@/lib/payment-receipt-pdf';
import { renderRaffleTicket } from '@/lib/raffle-ticket';
import type { PaymentReceiptSendResult } from '@/lib/payment-receipts';
import { canRecordSimulatedReceiptDelivery } from '@/lib/payments/receipt-delivery-policy';
import { isCanonicalPaymentReference } from '@/lib/payments/reference';

const STAFF = ['ndsc.cricket@gmail.com', 'ndcc.vicepres@gmail.com', 'ndcc.secretary1@gmail.com'];
const escape = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));

export async function sendPaidRaffleEmails(
  orderId: string,
  options: { issuedAt?: string } = {},
): Promise<PaymentReceiptSendResult> {
  const db = createServerClient();
  const { data: order, error } = await db.from('raffle_orders').select('*,raffle_tickets(ticket_reference,ticket_number)').eq('id', orderId).single();
  if (error || !order || order.status !== 'paid') {
    return { status: 'failed', reason: error?.message || 'Paid raffle order could not be loaded.' };
  }
  if (String(order.currency || '').toLowerCase() !== 'aud') {
    return { status: 'failed', reason: 'The paid raffle order is not recorded in AUD.' };
  }
  if (!Number.isSafeInteger(Number(order.amount_cents)) || Number(order.amount_cents) <= 0) {
    return { status: 'failed', reason: 'The paid raffle amount is invalid.' };
  }
  if (!order.paid_at) return { status: 'failed', reason: 'The paid raffle timestamp is missing.' };
  if (!isCanonicalPaymentReference(order.payment_reference, 'raffle')) {
    return { status: 'failed', reason: 'The paid raffle payment reference is not canonical.' };
  }
  const paymentIntent = String(order.stripe_payment_intent_id || '').trim();
  if (!/^pi_[A-Za-z0-9_]+$/.test(paymentIntent)) {
    return { status: 'failed', reason: 'The paid raffle payment intent is missing or invalid.' };
  }
  if (!String(order.customer_email || '').trim()) {
    return { status: 'failed', reason: 'The raffle purchaser email address is missing.' };
  }
  const references = (order.raffle_tickets || []).sort((a: { ticket_number: number }, b: { ticket_number: number }) => a.ticket_number - b.ticket_number).map((t: { ticket_reference: string }) => t.ticket_reference);
  if (references.length !== order.quantity) return { status: 'failed', reason: 'Raffle ticket allocation is incomplete.' };
  let customerResult: PaymentReceiptSendResult | null = null;
  if (!order.customer_email_sent_at || !order.staff_email_sent_at) {
    const pending = await db
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
        reason: 'The raffle payment still has a deferred financial event to replay.',
      };
    }
  }
  if (!order.customer_email_sent_at) {
    const ticketAttachments = await Promise.all(references.map(async (reference: string) => ({
      filename: `${reference}.png`, content: (await renderRaffleTicket(reference)).toString('base64'), contentType: 'image/png',
    })));
    const receiptData = {
      purchaserName: String(order.customer_name),
      purchaserEmail: String(order.customer_email),
      paymentDate: String(order.paid_at),
      issuedDate: options.issuedAt || String(order.paid_at),
      amountCents: Number(order.amount_cents),
      paymentType: 'Raffle Ticket Purchase',
      paymentMethod: 'Stripe Checkout',
      reference: String(order.payment_reference),
      descriptionLines: [`${order.quantity} x Dinos Trailer Raffle Ticket`, `Ticket references: ${references.join(', ')}`],
    };
    const receiptFilename = buildPaymentReceiptFilename(receiptData);
    const receipt = await buildPaymentReceiptPdf(receiptData);
    const attachments = [
      ...ticketAttachments,
      { filename: receiptFilename, content: receipt, contentType: 'application/pdf' },
    ];
    const result = await sendEmail({ ...receiptRecipients(order.customer_email, STAFF), replyTo: getTransactionalReplyTo(), subject: `NDCC raffle receipt - ${order.payment_reference}`,
      html: emailHtml('Your paid raffle tickets', `<p>Hi ${escape(order.customer_name)},</p><p><strong>Purchaser:</strong> ${escape(order.customer_name)}<br><strong>Email:</strong> ${escape(order.customer_email)}<br><strong>Paid:</strong> $${(order.amount_cents / 100).toFixed(2)} AUD</p><p>Stripe has confirmed your payment. Your payment reference is <strong>${escape(order.payment_reference)}</strong>.</p><p>Your ticket reference${references.length > 1 ? 's are' : ' is'}:</p><p style="font-size:18px;font-weight:bold;color:#800000">${references.map(escape).join('<br>')}</p><p>The raffle will be drawn on <strong>19 December 2026</strong> at the Christmas Party. Your ticket image${references.length > 1 ? 's are' : ' is'} and payment receipt are attached.</p>`), attachments, idempotencyKey: `raffle-customer-receipt-${orderId}` });
    if (result.status !== 'sent' && result.status !== 'simulated') return { status: 'failed', reason: result.reason };
    if (result.status === 'simulated' && !canRecordSimulatedReceiptDelivery()) {
      return { status: 'failed', reason: 'EMAIL_TEST_MODE cannot complete a raffle receipt in production.' };
    }
    const marked = await db.from('raffle_orders').update({ customer_email_sent_at: new Date().toISOString(), staff_email_sent_at: new Date().toISOString() }).eq('id', orderId).is('customer_email_sent_at', null);
    if (marked.error) {
      if (result.status === 'sent') {
        return {
          status: 'sent_unrecorded',
          reason: marked.error.message,
          id: result.id,
          filename: receiptFilename,
        };
      }
      return { status: 'failed', reason: marked.error.message };
    }
    customerResult = { ...result, filename: receiptFilename };
  }

  if (customerResult) return customerResult;
  return { status: 'already_sent', reason: 'Paid raffle emails were already recorded.' };
}


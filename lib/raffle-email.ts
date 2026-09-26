import 'server-only';
import { getNotificationRecipients, getReceiptRecipients } from '@/lib/notification-recipients';
import { createServerClient } from '@/lib/supabase-server';
import { emailHtml, getTransactionalReplyTo, sendEmail } from '@/lib/email';
import { buildPaymentReceiptFilename, buildPaymentReceiptPdf } from '@/lib/payment-receipt-pdf';
import { renderRaffleTicket } from '@/lib/raffle-ticket';
import type { PaymentReceiptSendResult } from '@/lib/payment-receipts';
import { canRecordSimulatedReceiptDelivery } from '@/lib/payments/receipt-delivery-policy';
import { isCanonicalPaymentReference } from '@/lib/payments/reference';
import { REVERSE_RAFFLE_CAMPAIGN_CODE } from '@/lib/raffle-constants';

const escape = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));

export async function sendPaidRaffleEmails(
  orderId: string,
  options: { issuedAt?: string } = {},
): Promise<PaymentReceiptSendResult> {
  const db = createServerClient();
  const { data: order, error } = await db.from('raffle_orders').select('*,raffle_campaigns(name,price_cents,draw_label),raffle_tickets(ticket_reference,ticket_number)').eq('id', orderId).single();
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
  const cashPayment = order.payment_method === 'cash' && Boolean((Boolean(order.cash_received_by) !== Boolean(order.cash_received_by_member)) && order.cash_received_at && order.cash_sale_key) && !order.stripe_payment_intent_id && !order.stripe_checkout_session_id;
  const bankPayment = order.payment_method === 'bank_transfer' && Boolean(order.bank_transfer_confirmed_at && order.bank_transfer_confirmed_by && String(order.bank_transfer_reference || '').trim().length >= 3) && !order.stripe_payment_intent_id && !order.stripe_checkout_session_id;
  if ((order.payment_method === 'bank_transfer' && !bankPayment) || (order.payment_method === 'cash' && !cashPayment) || (!cashPayment && !bankPayment && !/^pi_[A-Za-z0-9_]+$/.test(paymentIntent))) {
    return { status: 'failed', reason: 'The paid raffle payment intent is missing or invalid.' };
  }
  if (!String(order.customer_email || '').trim()) {
    return { status: 'failed', reason: 'The raffle purchaser email address is missing.' };
  }
  const references = (order.raffle_tickets || []).sort((a: { ticket_number: number }, b: { ticket_number: number }) => a.ticket_number - b.ticket_number).map((t: { ticket_reference: string }) => t.ticket_reference);
  if (references.length !== order.quantity) return { status: 'failed', reason: 'Raffle ticket allocation is incomplete.' };
  const campaign = order.raffle_campaigns;
  if (!campaign?.name || !Number.isSafeInteger(campaign.price_cents) || campaign.price_cents <= 0) {
    return { status: 'failed', reason: 'The raffle campaign details are missing or invalid.' };
  }
  // Paid unit price is frozen on the order; later campaign changes must not alter receipts.
  const ticketDetails = { name: campaign.name, priceCents: order.amount_cents / order.quantity, drawLabel: campaign.draw_label || null };
  let customerResult: PaymentReceiptSendResult | null = null;
  if (!cashPayment && !bankPayment && (!order.customer_email_sent_at || !order.staff_email_sent_at)) {
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
      filename: `${reference}.png`, content: (await renderRaffleTicket(reference, ticketDetails)).toString('base64'), contentType: 'image/png',
    })));
    const receiptData = {
      purchaserName: String(order.customer_name),
      purchaserEmail: String(order.customer_email),
      paymentDate: String(order.paid_at),
      issuedDate: options.issuedAt || String(order.paid_at),
      amountCents: Number(order.amount_cents),
      paymentType: 'Raffle Ticket Purchase',
      paymentMethod: bankPayment ? 'Bank transfer' : cashPayment ? (order.cash_received_by_member ? 'Cash - collected for NDCC' : 'Cash - received by NDCC') : 'Stripe Checkout',
      reference: String(order.payment_reference),
      descriptionLines: [`${order.quantity} x ${campaign.name} Ticket`, `Ticket references: ${references.join(', ')}`, ...(references[0]?.startsWith(`${REVERSE_RAFFLE_CAMPAIGN_CODE}-`) ? [`Raffle numbers: ${references.map((ref: string) => Number(ref.slice(-4))).join(', ')}`] : [])],
    };
    const receiptFilename = buildPaymentReceiptFilename(receiptData);
    const receipt = await buildPaymentReceiptPdf(receiptData);
    const attachments = [
      ...ticketAttachments,
      { filename: receiptFilename, content: receipt, contentType: 'application/pdf' },
    ];
    const staff = await getNotificationRecipients('raffle_staff');
    const result = await sendEmail({ ...(await getReceiptRecipients(order.customer_email, staff)), replyTo: getTransactionalReplyTo(), subject: `NDCC raffle receipt - ${order.payment_reference}`,
      html: emailHtml('Your paid raffle tickets', `<p>Hi ${escape(order.customer_name)},</p><p><strong>Purchaser:</strong> ${escape(order.customer_name)}<br><strong>Email:</strong> ${escape(order.customer_email)}<br><strong>Paid:</strong> $${(order.amount_cents / 100).toFixed(2)} AUD</p><p>${bankPayment ? 'NDCC has confirmed receipt of your bank transfer.' : cashPayment ? 'NDCC has recorded your cash payment.' : 'Stripe has confirmed your payment.'} Your payment reference is <strong>${escape(order.payment_reference)}</strong>.</p><p>Your ticket reference${references.length > 1 ? 's are' : ' is'}:</p><p style="font-size:18px;font-weight:bold;color:#880000">${references.map((ref: string) => ref.startsWith(`${REVERSE_RAFFLE_CAMPAIGN_CODE}-`) ? `Raffle number ${Number(ref.slice(-4))} - ${escape(ref)}` : escape(ref)).join('<br>')}</p>${campaign.draw_label ? `<p>${escape(campaign.draw_label)}</p>` : ''}<p>Your ticket image${references.length > 1 ? 's are' : ' is'} and payment receipt are attached.</p>`), attachments, idempotencyKey: `raffle-customer-receipt-${orderId}` });
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


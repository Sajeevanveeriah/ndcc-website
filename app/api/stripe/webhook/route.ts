/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createServerClient } from '@/lib/supabase-server';
import { getStripe } from '@/lib/stripe';
import { isPaymentTestMode } from '@/lib/payments/payment-config';
import { getCheckoutEventAction } from '@/lib/payments/stripe-checkout';
import { sendPaidStaffOrderNotificationForPayment } from '@/lib/order-notifications';
import { emailHtml, sendEmail } from '@/lib/email';
import { sendOrderPaymentReceiptForPayment } from '@/lib/payment-receipts';
import { buildPaymentReceiptFilename, buildPaymentReceiptPdf } from '@/lib/payment-receipt-pdf';
import { dinoEntryStatusForStripeEvent } from '@/lib/dino-coach/domain';
import { sendPaidRaffleEmails } from '@/lib/raffle-email';

export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type LedgerRow = {
  id: string;
  order_id: string;
  amount: number;
  status: string;
  provider_event_id: string | null;
  metadata: Record<string, unknown> | null;
};

type ServerSupabase = ReturnType<typeof createServerClient>;

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  if (typeof session.payment_intent === 'string') return session.payment_intent;
  return session.payment_intent?.id || null;
}

function cents(amount: number): number {
  return Math.round(Number(amount) * 100);
}

function isDuplicateError(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === '23505' || /duplicate key/i.test(error.message || '')));
}

function escapeEmailHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character] || character));
}

async function handleDinoCoachEvent(event: Stripe.Event): Promise<NextResponse | null> {
  const object = event.data.object as any;
  const isCheckout = event.type.startsWith('checkout.session.');
  const isDinoCheckout = isCheckout && object.metadata?.product === 'Dino Coach';
  const isDinoImpact = ['charge.refunded', 'charge.dispute.created', 'charge.dispute.closed'].includes(event.type);
  if (!isDinoCheckout && !isDinoImpact) return null;
  const supabase = createServerClient();
  let entry: any = null;
  if (isDinoCheckout) {
    const entryId = object.metadata?.entry_id;
    if (!entryId || !UUID_PATTERN.test(entryId)) return NextResponse.json({ error: 'Invalid Dino Coach entry metadata.' }, { status: 400 });
    const found = await supabase.from('fantasy_entries').select('*,fantasy_managers(display_name,email,team_name)').eq('id', entryId).maybeSingle();
    if (found.error || !found.data) return NextResponse.json({ error: 'Dino Coach entry was not found.' }, { status: 404 });
    entry = found.data;
    if (entry.manager_id !== object.metadata?.manager_id || entry.season_id !== object.metadata?.season_id || entry.entry_fee_cents !== Number(object.metadata?.expected_amount_cents)) {
      return NextResponse.json({ error: 'Dino Coach Checkout metadata mismatch.' }, { status: 400 });
    }
  } else {
    const paymentIntent = typeof object.payment_intent === 'string' ? object.payment_intent : object.payment_intent?.id;
    if (!paymentIntent) return NextResponse.json({ received: true, ignored: true });
    const found = await supabase.from('fantasy_entries').select('*,fantasy_managers(display_name,email,team_name)').eq('stripe_payment_intent_id', paymentIntent).maybeSingle();
    if (!found.data) return NextResponse.json({ received: true, ignored: true });
    entry = found.data;
  }
  const nextStatus = dinoEntryStatusForStripeEvent(event.type, {
    paymentStatus: object.payment_status, amount: object.amount, amountRefunded: object.amount_refunded, disputeStatus: object.status,
  });
  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
    if (object.payment_status !== 'paid' || object.amount_total !== entry.entry_fee_cents || String(object.currency).toLowerCase() !== 'aud') {
      return NextResponse.json({ error: 'Dino Coach settlement amount or currency mismatch.' }, { status: 400 });
    }
  }
  if (!nextStatus) return NextResponse.json({ received: true, ignored: true });
  const { data: paymentResult, error: paymentError } = await supabase.rpc('apply_dino_entry_payment_event', {
    target_entry_id: entry.id, target_provider_event_id: event.id, target_provider_event_type: event.type,
    target_provider_created_at: new Date(event.created * 1000).toISOString(), target_resulting_status: nextStatus,
    target_checkout_session_id: isCheckout ? object.id : null,
    target_payment_intent_id: isCheckout ? paymentIntentId(object) : object.payment_intent || null,
    target_evidence: { checkout_session_id: isCheckout ? object.id : null, payment_intent_id: isCheckout ? paymentIntentId(object) : object.payment_intent || null },
  });
  if (paymentError) return NextResponse.json({ error: 'Could not atomically record Dino Coach payment eligibility.' }, { status: 500 });
  const duplicate = paymentResult?.[0]?.duplicate === true;
  const recipient = entry.fantasy_managers?.email;
  if (recipient && nextStatus === 'paid') {
    const eventRecord = await supabase.from('fantasy_entry_payment_events').select('evidence').eq('provider_event_id', event.id).maybeSingle();
    if (eventRecord.error || !eventRecord.data) {
      return NextResponse.json({ error: 'Dino Coach receipt evidence could not be loaded.' }, { status: 500 });
    }
    const evidence = (eventRecord.data.evidence || {}) as Record<string, unknown>;
    if (typeof evidence.payment_receipt_sent_at !== 'string') {
      const receiptData = {
        purchaserName: String(entry.fantasy_managers.display_name || 'Dino Coach manager'),
        purchaserEmail: String(recipient),
        paymentDate: new Date(event.created * 1000),
        amountCents: Number(entry.entry_fee_cents),
        paymentType: 'Dino Coach Entry',
        paymentMethod: 'Stripe Checkout',
        reference: `DINO-${String(entry.id).slice(0, 8).toUpperCase()}`,
        descriptionLines: [`Dino Coach entry - ${String(entry.fantasy_managers.team_name || 'Team entry')}`],
      };
      const filename = buildPaymentReceiptFilename(receiptData);
      const receipt = await buildPaymentReceiptPdf(receiptData);
      const emailResult = await sendEmail({
        to: recipient,
        subject: 'Dino Coach payment confirmed',
        html: emailHtml('Payment confirmed', `<p>Hi ${escapeEmailHtml(entry.fantasy_managers.display_name)},</p><p>Your Dino Coach entry status is now <strong>paid</strong>.</p><p>You can build your squad when team selection is open. Your payment receipt is attached.</p>`),
        attachments: [{ filename, content: receipt, contentType: 'application/pdf' }],
        idempotencyKey: `dino-coach-${event.id}`,
        tags: [{ name: 'category', value: 'dino-coach-receipt' }],
      });
      if (emailResult.status !== 'sent' && emailResult.status !== 'simulated') {
        return NextResponse.json({ error: 'Dino Coach receipt delivery failed.' }, { status: 500 });
      }
      const receiptEvidence: Record<string, unknown> = {
        ...evidence,
        payment_receipt_sent_at: new Date().toISOString(),
        payment_receipt_filename: filename,
      };
      if (emailResult.status === 'sent' && emailResult.id) receiptEvidence.payment_receipt_message_id = emailResult.id;
      const marked = await supabase.from('fantasy_entry_payment_events').update({ evidence: receiptEvidence }).eq('provider_event_id', event.id).select('id').maybeSingle();
      if (marked.error || !marked.data) {
        return NextResponse.json({ error: 'Dino Coach receipt evidence could not be recorded.' }, { status: 500 });
      }
    }
  } else if (recipient && !duplicate) {
    const emailResult = await sendEmail({ to: recipient, subject: 'Dino Coach entry eligibility update',
      html: emailHtml('Entry eligibility update', `<p>Hi ${escapeEmailHtml(entry.fantasy_managers.display_name)},</p><p>Your Dino Coach entry status is now <strong>${nextStatus}</strong>.</p><p>Team-selection eligibility is paused while this payment status applies. Contact the club if you need help.</p>`),
      idempotencyKey: `dino-coach-${event.id}` });
    if (emailResult.status !== 'sent' && emailResult.status !== 'simulated') {
      return NextResponse.json({ error: 'Dino Coach eligibility email delivery failed.' }, { status: 500 });
    }
  }
  return NextResponse.json({ received: true, dinoCoach: true, status: nextStatus, duplicate });
}

async function handleRaffleEvent(event: Stripe.Event): Promise<NextResponse | null> {
  if (!event.type.startsWith('checkout.session.')) return null;
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.metadata?.product !== 'NDCC Raffle') return null;
  const orderId = session.metadata.raffle_order_id;
  if (!orderId || !UUID_PATTERN.test(orderId)) return NextResponse.json({ error: 'Invalid raffle order metadata.' }, { status: 400 });
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
    return NextResponse.json({ received: true, raffle: true, pending: true });
  }
  if (session.payment_status !== 'paid' || session.currency?.toLowerCase() !== 'aud') {
    return NextResponse.json({ received: true, raffle: true, pending: true });
  }
  const db = createServerClient();
  const { data: order, error } = await db.from('raffle_orders').select('id,amount_cents,quantity').eq('id', orderId).single();
  if (error || !order) return NextResponse.json({ error: 'Raffle order not found.' }, { status: 404 });
  const expected = Number(session.metadata.expected_amount_cents);
  if (session.amount_total !== order.amount_cents || expected !== order.amount_cents || Number(session.metadata.quantity) !== order.quantity) {
    return NextResponse.json({ error: 'Raffle settlement mismatch.' }, { status: 400 });
  }
  const { data: tickets, error: issueError } = await db.rpc('issue_paid_raffle_tickets', {
    target_order_id: orderId, target_provider_event_id: event.id, target_session_id: session.id,
    target_payment_intent_id: paymentIntentId(session),
  });
  if (issueError || !tickets?.length) {
    console.error('Raffle ticket allocation failed:', issueError);
    return NextResponse.json({ error: 'Raffle ticket allocation failed.' }, { status: 500 });
  }
  try { await sendPaidRaffleEmails(orderId, event.id); }
  catch (emailError) { console.error('Raffle email failed:', emailError); return NextResponse.json({ error: 'Raffle email delivery failed.' }, { status: 500 }); }
  return NextResponse.json({ received: true, raffle: true, duplicate: tickets.every((t: { duplicate: boolean }) => t.duplicate) });
}

async function notifyPaidOrder(
  supabase: ServerSupabase,
  payment: Pick<LedgerRow, 'id'>,
  orderId: string,
): Promise<boolean> {
  const receipt = await sendOrderPaymentReceiptForPayment(supabase, payment.id, orderId);
  if (receipt.status === 'failed') {
    console.error(`Webhook: customer receipt for payment ${payment.id} failed:`, receipt.reason);
    return false;
  }
  const notification = await sendPaidStaffOrderNotificationForPayment(supabase, payment, orderId);
  if (notification.status === 'failed') {
    console.error(`Webhook: paid staff notification for order ${orderId} failed:`, notification.reason);
    return false;
  }
  return true;
}

async function markSessionFailed(
  session: Stripe.Checkout.Session,
  event: Stripe.Event
) {
  const supabase = createServerClient();
  const { error } = await supabase
    .from('order_payments')
    .update({
      status: 'failed',
      provider_event_id: event.id,
    })
    .eq('provider', 'stripe')
    .eq('provider_reference', session.id)
    .eq('status', 'pending');

  if (error) {
    console.error(`Webhook: failed to mark Stripe session ${session.id} as failed:`, error);
    return NextResponse.json({ error: 'Failed to update payment attempt.' }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}

async function settleSession(session: Stripe.Checkout.Session, event: Stripe.Event) {
  const orderId = session.metadata?.order_id;
  if (!orderId || !UUID_PATTERN.test(orderId)) {
    console.warn(`Webhook: Stripe session ${session.id} is not linked to a valid NDCC order; ignored.`);
    return NextResponse.json({ received: true, ignored: true });
  }

  if (session.payment_status !== 'paid') {
    console.warn(`Webhook: settlement event ${event.id} has payment_status ${session.payment_status}; waiting.`);
    return NextResponse.json({ received: true, pending: true });
  }

  const amountCents = typeof session.amount_total === 'number' ? session.amount_total : 0;
  if (amountCents <= 0 || (session.currency || '').toLowerCase() !== 'aud') {
    console.error(`Webhook: Stripe session ${session.id} has an invalid AUD settlement amount.`);
    return NextResponse.json({ error: 'Invalid settlement amount.' }, { status: 500 });
  }

  const expectedAmountCents = Number(session.metadata?.expected_amount_cents || amountCents);
  if (!Number.isInteger(expectedAmountCents) || expectedAmountCents !== amountCents) {
    console.error(`Webhook: Stripe session ${session.id} amount does not match its signed metadata.`);
    return NextResponse.json({ error: 'Payment amount mismatch.' }, { status: 500 });
  }

  const supabase = createServerClient();
  const { data: existing, error: existingError } = await supabase
    .from('order_payments')
    .select('id,order_id,amount,status,provider_event_id,metadata')
    .eq('provider', 'stripe')
    .eq('provider_reference', session.id)
    .maybeSingle();

  if (existingError) {
    console.error('Webhook: failed to load the pending Stripe ledger row:', existingError);
    return NextResponse.json({ error: 'Payment ledger unavailable.' }, { status: 500 });
  }

  const payment = existing as LedgerRow | null;
  if (payment) {
    if (payment.order_id !== orderId || cents(payment.amount) !== amountCents) {
      console.error(`Webhook: Stripe session ${session.id} does not match its pending ledger row.`);
      return NextResponse.json({ error: 'Payment ledger mismatch.' }, { status: 500 });
    }
    if (payment.status === 'settled') {
      if (!(await notifyPaidOrder(supabase, payment, orderId))) {
        return NextResponse.json({ error: 'Paid order notification failed.' }, { status: 500 });
      }
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (payment.status !== 'pending' && payment.status !== 'failed') {
      console.error(`Webhook: Stripe session ${session.id} has non-settleable ledger status ${payment.status}.`);
      return NextResponse.json({ error: 'Payment ledger state conflict.' }, { status: 500 });
    }

    const settledMetadata = {
      ...(payment.metadata || {}),
      payment_intent: paymentIntentId(session),
      settlement_event_type: event.type,
    };
    const { data: settled, error: settleError } = await supabase
      .from('order_payments')
      .update({
        status: 'settled',
        provider_event_id: event.id,
        received_at: new Date(event.created * 1000).toISOString(),
        recorded_by: 'stripe-webhook',
        metadata: settledMetadata,
      })
      .eq('id', payment.id)
      .eq('status', payment.status)
      .select('id')
      .maybeSingle();

    if (isDuplicateError(settleError)) {
      const { data: duplicatePayment } = await supabase
        .from('order_payments')
        .select('id,metadata')
        .eq('id', payment.id)
        .maybeSingle();
      if (duplicatePayment && !(await notifyPaidOrder(supabase, duplicatePayment, orderId))) {
        return NextResponse.json({ error: 'Paid order notification failed.' }, { status: 500 });
      }
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (settleError) {
      console.error('Webhook: failed to settle the pending Stripe ledger row:', settleError);
      return NextResponse.json({ error: 'Failed to record payment.' }, { status: 500 });
    }
    if (!settled) {
      const { data: concurrent } = await supabase
        .from('order_payments')
        .select('status,metadata')
        .eq('id', payment.id)
        .maybeSingle();
      if (concurrent?.status === 'settled') {
        if (!(await notifyPaidOrder(supabase, { id: payment.id }, orderId))) {
          return NextResponse.json({ error: 'Paid order notification failed.' }, { status: 500 });
        }
        return NextResponse.json({ received: true, duplicate: true });
      }
      return NextResponse.json({ error: 'Concurrent payment update conflict.' }, { status: 500 });
    }

    if (!(await notifyPaidOrder(supabase, { id: payment.id }, orderId))) {
      return NextResponse.json({ error: 'Paid order notification failed.' }, { status: 500 });
    }
    return NextResponse.json({ received: true });
  }

  // Compatibility for a Checkout Session created by the previous route,
  // before pending Stripe attempts were added to the ledger.
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id,payment_reference')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError || !order) {
    console.error(`Webhook: order ${orderId} for legacy Stripe session ${session.id} was not found.`, orderError);
    return NextResponse.json({ error: 'Order not found.' }, { status: 500 });
  }
  if (session.client_reference_id && session.client_reference_id !== orderId) {
    return NextResponse.json({ error: 'Checkout order reference mismatch.' }, { status: 500 });
  }
  if (session.metadata?.payment_reference && session.metadata.payment_reference !== order.payment_reference) {
    return NextResponse.json({ error: 'Checkout payment reference mismatch.' }, { status: 500 });
  }

  const legacyMetadata = {
    payment_intent: paymentIntentId(session),
    payment_kind: session.metadata?.payment_kind || 'balance',
    payment_reference: session.metadata?.payment_reference || null,
    settlement_event_type: event.type,
  };
  const { data: legacyPayment, error: insertError } = await supabase
    .from('order_payments')
    .insert({
      order_id: orderId,
      amount: amountCents / 100,
      currency: 'AUD',
      method: 'stripe',
      provider: 'stripe',
      provider_reference: session.id,
      provider_event_id: event.id,
      status: 'settled',
      received_at: new Date(event.created * 1000).toISOString(),
      recorded_by: 'stripe-webhook-legacy',
      metadata: legacyMetadata,
    })
    .select('id,metadata')
    .single();

  if (isDuplicateError(insertError)) {
    const { data: duplicatePayment } = await supabase
      .from('order_payments')
      .select('id,metadata')
      .eq('provider', 'stripe')
      .eq('provider_reference', session.id)
      .maybeSingle();
    if (duplicatePayment && !(await notifyPaidOrder(supabase, duplicatePayment, orderId))) {
      return NextResponse.json({ error: 'Paid order notification failed.' }, { status: 500 });
    }
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (insertError || !legacyPayment) {
    console.error('Webhook: failed to record the legacy Stripe payment:', insertError);
    return NextResponse.json({ error: 'Failed to record payment.' }, { status: 500 });
  }
  if (!(await notifyPaidOrder(supabase, legacyPayment, orderId))) {
    return NextResponse.json({ error: 'Paid order notification failed.' }, { status: 500 });
  }
  return NextResponse.json({ received: true, legacy: true });
}

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');
  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const body = await request.text();
    event = getStripe().webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  if (event.livemode === isPaymentTestMode()) {
    console.error(`Webhook: event ${event.id} mode does not match PAYMENT_TEST_MODE.`);
    return NextResponse.json({ error: 'Webhook mode mismatch.' }, { status: 400 });
  }

  const dinoCoachResult = await handleDinoCoachEvent(event);
  if (dinoCoachResult) return dinoCoachResult;

  const raffleResult = await handleRaffleEvent(event);
  if (raffleResult) return raffleResult;

  const session = event.data.object as Stripe.Checkout.Session;
  const action = getCheckoutEventAction(event.type, session.payment_status);
  if (action === 'ignore') return NextResponse.json({ received: true, ignored: true });
  if (action === 'pending') return NextResponse.json({ received: true, pending: true });
  if (action === 'fail') return markSessionFailed(session, event);
  return settleSession(session, event);
}

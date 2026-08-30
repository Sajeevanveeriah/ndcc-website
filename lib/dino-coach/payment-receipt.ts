import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  emailHtml,
  escapeEmailHtml,
  getTransactionalReplyTo,
  sendEmail,
} from '@/lib/email';
import {
  buildPaymentReceiptFilename,
  buildPaymentReceiptPdf,
} from '@/lib/payment-receipt-pdf';
import type { PaymentReceiptSendResult } from '@/lib/payment-receipts';
import { canRecordSimulatedReceiptDelivery } from '@/lib/payments/receipt-delivery-policy';
import { isCanonicalPaymentReference } from '@/lib/payments/reference';

type LegacyReceiptEvidence = {
  payment_receipt_sent_at?: unknown;
  payment_receipt_message_id?: unknown;
  payment_receipt_filename?: unknown;
};

function managerRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === 'object' ? first as Record<string, unknown> : null;
  }
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function legacyReceiptMarker(rows: Array<{ evidence?: unknown }> | null): LegacyReceiptEvidence | null {
  for (const row of rows || []) {
    const evidence = row.evidence;
    if (!evidence || typeof evidence !== 'object') continue;
    const marker = evidence as LegacyReceiptEvidence;
    if (typeof marker.payment_receipt_sent_at === 'string') return marker;
  }
  return null;
}

export async function sendDinoCoachPaymentReceiptForEntry(
  supabase: SupabaseClient,
  entryId: string,
  options: { issuedAt?: string } = {},
): Promise<PaymentReceiptSendResult> {
  const { data: entry, error: entryError } = await supabase
    .from('fantasy_entries')
    .select('id,status,paid_at,entry_fee_cents,currency,payment_reference,stripe_payment_intent_id,customer_receipt_sent_at,customer_receipt_message_id,customer_receipt_filename,fantasy_managers(display_name,email,team_name)')
    .eq('id', entryId)
    .maybeSingle();
  if (entryError || !entry) {
    return { status: 'failed', reason: entryError?.message || 'Dino Coach entry was not found.' };
  }

  if (typeof entry.customer_receipt_sent_at === 'string') {
    return {
      status: 'already_sent',
      reason: 'Dino Coach payment receipt was already recorded.',
      id: typeof entry.customer_receipt_message_id === 'string'
        ? entry.customer_receipt_message_id
        : undefined,
      filename: typeof entry.customer_receipt_filename === 'string'
        ? entry.customer_receipt_filename
        : undefined,
    };
  }
  if (entry.status !== 'paid' || !entry.paid_at) {
    return { status: 'failed', reason: 'A receipt can only be sent for a paid Dino Coach entry.' };
  }
  if (String(entry.currency || '').toUpperCase() !== 'AUD') {
    return { status: 'failed', reason: 'The Dino Coach entry is not recorded in AUD.' };
  }
  const paymentIntent = String(entry.stripe_payment_intent_id || '').trim();
  if (!/^pi_[A-Za-z0-9_]+$/.test(paymentIntent)) {
    return { status: 'failed', reason: 'The Dino Coach payment intent is missing or invalid.' };
  }

  const reference = String(entry.payment_reference || '').trim();
  if (!isCanonicalPaymentReference(reference, 'dino_coach')) {
    return { status: 'failed', reason: 'The Dino Coach payment reference is not canonical.' };
  }

  // Bridge receipts delivered by the pre-outbox webhook. This prevents a
  // deployment-time duplicate even though that implementation keyed its
  // marker to a Stripe Event rather than the entry identity.
  const { data: legacyEvents, error: legacyError } = await supabase
    .from('fantasy_entry_payment_events')
    .select('evidence')
    .eq('entry_id', entryId);
  if (legacyError) return { status: 'failed', reason: legacyError.message };
  const legacy = legacyReceiptMarker(legacyEvents);
  if (legacy) {
    const legacySentAt = String(legacy.payment_receipt_sent_at);
    const marked = await supabase
      .from('fantasy_entries')
      .update({
        customer_receipt_sent_at: legacySentAt,
        customer_receipt_message_id: typeof legacy.payment_receipt_message_id === 'string'
          ? legacy.payment_receipt_message_id
          : null,
        customer_receipt_filename: typeof legacy.payment_receipt_filename === 'string'
          ? legacy.payment_receipt_filename
          : null,
      })
      .eq('id', entryId)
      .is('customer_receipt_sent_at', null);
    if (marked.error) return { status: 'failed', reason: marked.error.message };
    return {
      status: 'already_sent',
      reason: 'A legacy Dino Coach receipt delivery was already recorded.',
      id: typeof legacy.payment_receipt_message_id === 'string'
        ? legacy.payment_receipt_message_id
        : undefined,
      filename: typeof legacy.payment_receipt_filename === 'string'
        ? legacy.payment_receipt_filename
        : undefined,
    };
  }

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
      reason: 'The Dino Coach payment still has a deferred financial event to replay.',
    };
  }

  const manager = managerRecord(entry.fantasy_managers);
  const recipient = String(manager?.email || '').trim();
  if (!recipient) return { status: 'failed', reason: 'The Dino Coach manager email address is missing.' };

  const amountCents = Number(entry.entry_fee_cents);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    return { status: 'failed', reason: 'The Dino Coach entry fee is invalid.' };
  }

  const purchaserName = String(manager?.display_name || 'Dino Coach manager');
  const teamName = String(manager?.team_name || 'Team entry');
  const receiptData = {
    purchaserName,
    purchaserEmail: recipient,
    paymentDate: String(entry.paid_at),
    issuedDate: options.issuedAt || String(entry.paid_at),
    amountCents,
    paymentType: 'Dino Coach Entry',
    paymentMethod: 'Stripe Checkout',
    reference,
    descriptionLines: [`Dino Coach entry - ${teamName}`],
  };
  const filename = buildPaymentReceiptFilename(receiptData);
  const receipt = await buildPaymentReceiptPdf(receiptData);
  const result = await sendEmail({
    to: recipient,
    replyTo: getTransactionalReplyTo(),
    subject: `Your NDCC Dino Coach payment receipt - ${reference}`,
    html: emailHtml(
      'Dino Coach payment confirmed',
      `<p>Hi ${escapeEmailHtml(purchaserName)},</p><p>Your Dino Coach entry status is now <strong>paid</strong>.</p><p>Your payment reference is <strong>${escapeEmailHtml(reference)}</strong>. Your payment receipt is attached as a PDF.</p><p>You can build your squad when team selection is open.</p>`,
    ),
    attachments: [{ filename, content: receipt, contentType: 'application/pdf' }],
    idempotencyKey: `dino-coach-receipt-${entryId}`,
    tags: [{ name: 'category', value: 'dino-coach-receipt' }],
  });
  if (result.status !== 'sent' && result.status !== 'simulated') {
    return { status: 'failed', reason: result.reason };
  }
  if (result.status === 'simulated' && !canRecordSimulatedReceiptDelivery()) {
    return {
      status: 'failed',
      reason: 'EMAIL_TEST_MODE cannot complete a Dino Coach receipt in production.',
    };
  }

  const sentAt = new Date().toISOString();
  const { data: marked, error: markerError } = await supabase
    .from('fantasy_entries')
    .update({
      customer_receipt_sent_at: sentAt,
      customer_receipt_message_id: result.status === 'sent' ? result.id || null : null,
      customer_receipt_filename: filename,
    })
    .eq('id', entryId)
    .eq('status', 'paid')
    .is('customer_receipt_sent_at', null)
    .select('id')
    .maybeSingle();
  if (markerError) {
    if (result.status === 'sent') {
      return {
        status: 'sent_unrecorded',
        reason: markerError.message,
        id: result.id,
        filename,
      };
    }
    return { status: 'failed', reason: markerError.message };
  }
  if (!marked) {
    const current = await supabase
      .from('fantasy_entries')
      .select('customer_receipt_sent_at')
      .eq('id', entryId)
      .maybeSingle();
    if (current.error || !current.data?.customer_receipt_sent_at) {
      if (result.status === 'sent') {
        return {
          status: 'sent_unrecorded',
          reason: current.error?.message || 'Dino Coach receipt delivery could not be recorded.',
          id: result.id,
          filename,
        };
      }
      return {
        status: 'failed',
        reason: current.error?.message || 'Dino Coach receipt delivery could not be recorded.',
      };
    }
  }
  return { ...result, filename };
}

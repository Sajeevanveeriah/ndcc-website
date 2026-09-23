import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createServerClient } from '@/lib/supabase-server';
import { emailHtml, getTransactionalReplyTo, sendEmail } from '@/lib/email';
import { dinoEntryStatusForStripeEvent } from '@/lib/dino-coach/domain';
import { isCanonicalPaymentReference } from '@/lib/payments/reference';
import {
  UUID_PATTERN,
  ensureLegacyReference,
  isCleanLegacyContract,
  paymentIntentId,
  queueAndAttemptReceipt,
  replayDeferredFinancialEvents,
  type ServerSupabase,
  upgradeLegacyPaymentIntent,
} from './shared';

// Dino Coach entry-fee Checkout Sessions (metadata.product === 'Dino Coach').

function escapeEmailHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character] || character));
}

type DinoManagerContact = { display_name?: string | null; email?: string | null };
type DinoEntryManagerJoin = {
  fantasy_managers?: DinoManagerContact | DinoManagerContact[] | null;
};
type DinoEntryRow = {
  id: string;
  manager_id: string;
  season_id: string;
  entry_fee_cents: number;
  payment_reference: string | null;
};

export async function bestEffortDinoEligibilityNotice(
  supabase: ServerSupabase,
  entryId: string,
  status: string,
  eventId: string,
) {
  if (status === 'paid') return;
  try {
    const { data: entry, error } = await supabase
      .from('fantasy_entries')
      .select('id,fantasy_managers(display_name,email)')
      .eq('id', entryId)
      .maybeSingle();
    const managers = (entry as DinoEntryManagerJoin | null)?.fantasy_managers;
    const manager = Array.isArray(managers)
      ? managers[0]
      : managers;
    if (error || !manager?.email) {
      if (error) console.error('Dino Coach eligibility recipient lookup failed:', error);
      return;
    }
    const result = await sendEmail({
      to: manager.email,
      replyTo: getTransactionalReplyTo(),
      subject: 'Dino Coach entry eligibility update',
      html: emailHtml(
        'Entry eligibility update',
        `<p>Hi ${escapeEmailHtml(manager.display_name)},</p><p>Your Dino Coach entry status is now <strong>${escapeEmailHtml(status)}</strong>.</p><p>Team-selection eligibility is paused while this payment status applies. Contact the club if you need help.</p>`,
      ),
      idempotencyKey: `dino-coach-eligibility-${eventId}`,
    });
    if (result.status !== 'sent' && result.status !== 'simulated') {
      console.error('Dino Coach eligibility email delivery failed:', result.reason);
    }
  } catch (error) {
    console.error('Dino Coach eligibility notice threw after durable state was recorded:', error);
  }
}

export async function handleDinoCoachCheckout(event: Stripe.Event): Promise<NextResponse | null> {
  if (!event.type.startsWith('checkout.session.')) return null;
  const session = event.data.object as Stripe.Checkout.Session;
  const metadata = (session.metadata || {}) as Record<string, string>;
  if (metadata.product !== 'Dino Coach') return null;
  const entryId = metadata.entry_id;
  if (!entryId || !UUID_PATTERN.test(entryId)) {
    return NextResponse.json({ error: 'Invalid Dino Coach entry metadata.' }, { status: 400 });
  }
  const supabase = createServerClient();
  const found = await supabase
    .from('fantasy_entries')
    .select('*,fantasy_managers(display_name,email,team_name)')
    .eq('id', entryId)
    .maybeSingle();
  if (found.error || !found.data) {
    return NextResponse.json({ error: 'Dino Coach entry was not found.' }, { status: 404 });
  }
  const entry = found.data as DinoEntryRow;
  if (entry.manager_id !== metadata.manager_id
    || entry.season_id !== metadata.season_id
    || entry.entry_fee_cents !== Number(metadata.expected_amount_cents)) {
    return NextResponse.json({ error: 'Dino Coach Checkout metadata mismatch.' }, { status: 400 });
  }

  const nextStatus = dinoEntryStatusForStripeEvent(event.type, {
    paymentStatus: session.payment_status,
  });
  if (!nextStatus) return NextResponse.json({ received: true, ignored: true });
  const isPaidSettlement = nextStatus === 'paid';
  const intentId = paymentIntentId(session);
  if (isPaidSettlement && (
    session.payment_status !== 'paid'
    || session.amount_total !== entry.entry_fee_cents
    || String(session.currency).toLowerCase() !== 'aud'
    || !intentId
  )) {
    return NextResponse.json({ error: 'Dino Coach settlement amount, currency or PaymentIntent mismatch.' }, { status: 400 });
  }

  let paymentReference = String(entry.payment_reference || '');
  const modern = metadata.ndcc_reference_version === '1';
  if (modern) {
    if (!isCanonicalPaymentReference(paymentReference, 'dino_coach')
      || metadata.ndcc_payment_reference !== paymentReference
      || metadata.item_number !== paymentReference
      || metadata.ndcc_payment_type !== 'dino_coach'
      || metadata.ndcc_order_id !== entry.id
      || metadata.payment_reference !== paymentReference
      || session.client_reference_id !== paymentReference) {
      return NextResponse.json({ error: 'Dino Coach payment-reference contract mismatch.' }, { status: 400 });
    }
  } else {
    if (!isCleanLegacyContract(metadata) || session.client_reference_id !== entry.id) {
      return NextResponse.json({ error: 'Malformed legacy Dino Coach Checkout contract.' }, { status: 400 });
    }
    if (isPaidSettlement && intentId) {
      const ensured = await ensureLegacyReference(supabase, {
        domain: 'dino_coach',
        recordId: entry.id,
        sessionId: session.id,
        paymentIntent: intentId,
        amountCents: entry.entry_fee_cents,
      });
      if (!ensured) {
        return NextResponse.json({ error: 'Dino Coach payment reference could not be upgraded.' }, { status: 500 });
      }
      paymentReference = ensured.paymentReference;
      const upgraded = await upgradeLegacyPaymentIntent(
        intentId,
        paymentReference,
        'dino_coach',
        entry.id,
        metadata,
      );
      if (!upgraded) {
        return NextResponse.json({ error: 'Dino Coach PaymentIntent upgrade is temporarily unavailable.' }, { status: 503 });
      }
    }
  }

  const paymentEvent = await supabase.rpc('apply_dino_entry_payment_event', {
    target_entry_id: entry.id,
    target_provider_event_id: event.id,
    target_provider_event_type: event.type,
    target_provider_created_at: new Date(event.created * 1000).toISOString(),
    target_resulting_status: nextStatus,
    target_checkout_session_id: session.id,
    target_payment_intent_id: intentId,
    target_evidence: {
      checkout_session_id: session.id,
      payment_intent_id: intentId,
      payment_reference: paymentReference || null,
      amount_cents: Number(session.amount_total || 0),
      legacy_contract_upgraded: !modern && isPaidSettlement,
    },
  });
  if (paymentEvent.error) {
    console.error('Dino Coach settlement RPC failed:', paymentEvent.error);
    return NextResponse.json({ error: 'Could not atomically record Dino Coach payment eligibility.' }, { status: 500 });
  }
  const duplicate = paymentEvent.data?.[0]?.duplicate === true;
  let appliedStatus = String(paymentEvent.data?.[0]?.entry_status || nextStatus);

  if (isPaidSettlement && intentId) {
    const replayed = await replayDeferredFinancialEvents(supabase, intentId);
    if (!replayed.ok) {
      console.error('Dino Coach deferred financial replay failed:', replayed.reason);
      return NextResponse.json({ error: 'Deferred Stripe financial events could not be replayed.' }, { status: 500 });
    }
    const refreshed = await supabase
      .from('fantasy_entries')
      .select('status')
      .eq('id', entry.id)
      .maybeSingle();
    if (refreshed.error) {
      return NextResponse.json({ error: 'Dino Coach post-settlement state could not be verified.' }, { status: 500 });
    }
    appliedStatus = String(refreshed.data?.status || appliedStatus);
    if (appliedStatus === 'paid') {
      const receipt = await queueAndAttemptReceipt(supabase, 'dino_entry', entry.id);
      if (!receipt.ok) {
        console.error('Dino Coach receipt could not be queued:', receipt.reason);
        return NextResponse.json({ error: 'Receipt delivery could not be queued.' }, { status: 500 });
      }
    }
  }
  if (!duplicate && appliedStatus !== 'paid') {
    await bestEffortDinoEligibilityNotice(supabase, entry.id, appliedStatus, event.id);
  }
  return NextResponse.json({
    received: true,
    dinoCoach: true,
    status: appliedStatus,
    duplicate,
    legacy_upgraded: !modern && isPaidSettlement,
  });
}

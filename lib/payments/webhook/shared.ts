import type Stripe from 'stripe';
import { createServerClient } from '@/lib/supabase-server';
import { getStripe } from '@/lib/stripe';
import {
  isCanonicalPaymentReference,
  normalisePaymentReferenceCategory,
  type PaymentReferenceCategory,
} from '@/lib/payments/reference';
import {
  attemptPaymentReceiptDelivery,
  enqueuePaymentReceiptJob,
  type ReceiptDeliveryKind,
} from '@/lib/payments/receipt-delivery';

// Shared helpers for the Stripe webhook handlers (app/api/stripe/webhook).

export const LEGACY_ORDER_CATEGORIES = new Set([
  'donation',
  'merch',
  'merchandise',
  'kitchen',
  'membership',
  'event',
  'general',
]);

export type ServerSupabase = ReturnType<typeof createServerClient>;
export type FinancialRpcResult = {
  handled?: boolean;
  duplicate?: boolean;
  deferred?: boolean;
  payment_domain?: string | null;
  order_id?: string | null;
  raffle_order_id?: string | null;
  fantasy_entry_id?: string | null;
  resulting_status?: string | null;
  state_changed?: boolean;
};

export function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  if (typeof session.payment_intent === 'string') return session.payment_intent;
  return session.payment_intent?.id || null;
}

export async function replayDeferredFinancialEvents(
  supabase: ServerSupabase,
  paymentIntent: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const pending = await supabase
    .from('stripe_payment_events')
    .select('provider_event_id,evidence')
    .eq('payment_intent_id', paymentIntent)
    .eq('payment_domain', 'pending')
    .order('provider_created_at', { ascending: true })
    .order('provider_event_id', { ascending: true });
  if (pending.error) return { ok: false, reason: pending.error.message };
  for (const event of pending.data || []) {
    const args = (event.evidence as Record<string, unknown> | null)?.rpc_args;
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      return { ok: false, reason: `Deferred Stripe event ${event.provider_event_id} has invalid replay evidence.` };
    }
    const replayed = await supabase.rpc(
      'apply_stripe_financial_event',
      args as Record<string, unknown>,
    );
    const result = replayed.data?.[0] as FinancialRpcResult | undefined;
    if (replayed.error || !result?.handled || result.deferred) {
      return {
        ok: false,
        reason: replayed.error?.message
          || `Deferred Stripe event ${event.provider_event_id} could not be applied after settlement.`,
      };
    }
  }
  return { ok: true };
}

export async function queueAndAttemptReceipt(
  supabase: ServerSupabase,
  kind: ReceiptDeliveryKind,
  sourceId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const queued = await enqueuePaymentReceiptJob(supabase, kind, sourceId);
  if (!queued.ok) return queued;
  try {
    const attempt = await attemptPaymentReceiptDelivery(supabase, queued.jobId);
    if (!['delivered', 'not_claimed'].includes(attempt.status)) {
      console.error(
        `Receipt job ${queued.jobId} remains durable with status ${attempt.status}:`,
        attempt.reason || 'retry scheduled',
      );
    }
  } catch (error) {
    console.error(`Receipt job ${queued.jobId} remains queued after an immediate-attempt error:`, error);
  }
  return { ok: true };
}

export function universalPaymentMetadata(
  paymentReference: string,
  paymentType: PaymentReferenceCategory,
  recordId: string,
  legacyMetadata: Record<string, string>,
): Record<string, string> {
  return {
    ...legacyMetadata,
    ndcc_payment_reference: paymentReference,
    ndcc_payment_type: paymentType,
    ndcc_order_id: recordId,
    ndcc_reference_version: '1',
    item_number: paymentReference,
  };
}

export async function upgradeLegacyPaymentIntent(
  paymentIntent: string,
  paymentReference: string,
  paymentType: PaymentReferenceCategory,
  recordId: string,
  legacyMetadata: Record<string, string>,
): Promise<boolean> {
  const metadata = universalPaymentMetadata(
    paymentReference,
    paymentType,
    recordId,
    legacyMetadata,
  );
  const updated = await getStripe().paymentIntents.update(paymentIntent, {
    description: `${paymentReference} - NDCC ${paymentType.replaceAll('_', ' ')}`,
    metadata,
  }).catch(() => null);
  return Boolean(updated
    && updated.metadata?.ndcc_payment_reference === paymentReference
    && updated.metadata?.item_number === paymentReference
    && updated.metadata?.ndcc_payment_type === paymentType
    && updated.metadata?.ndcc_order_id === recordId
    && updated.metadata?.ndcc_reference_version === '1');
}

export async function ensureLegacyReference(
  supabase: ServerSupabase,
  input: {
    domain: 'order' | 'raffle' | 'dino_coach';
    recordId: string;
    sessionId: string;
    paymentIntent: string;
    amountCents: number;
    orderCategory?: string | null;
    paymentKind?: string | null;
    legacyReference?: string | null;
  },
): Promise<{ paymentReference: string; paymentType: PaymentReferenceCategory; ledgerPaymentId: string | null } | null> {
  const result = await supabase.rpc('ensure_legacy_stripe_payment_reference', {
    target_payment_domain: input.domain,
    target_record_id: input.recordId,
    target_checkout_session_id: input.sessionId,
    target_payment_intent_id: input.paymentIntent,
    target_amount_cents: input.amountCents,
    target_order_category: input.orderCategory || null,
    target_payment_kind: input.paymentKind || null,
    target_legacy_reference: input.legacyReference || null,
  });
  const ensured = result.data?.[0];
  const paymentType = normalisePaymentReferenceCategory(ensured?.payment_type);
  if (result.error || !isCanonicalPaymentReference(ensured?.payment_reference, paymentType)) {
    console.error(`Legacy ${input.domain} payment-reference upgrade failed:`, result.error);
    return null;
  }
  return {
    paymentReference: ensured.payment_reference,
    paymentType,
    ledgerPaymentId: typeof ensured.ledger_payment_id === 'string'
      ? ensured.ledger_payment_id
      : null,
  };
}

export function isCleanLegacyContract(metadata: Record<string, string>): boolean {
  return !metadata.ndcc_reference_version
    && !metadata.ndcc_payment_reference
    && !metadata.item_number
    && !metadata.ndcc_order_id
    && !metadata.ndcc_payment_type;
}

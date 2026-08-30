import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import type Stripe from 'stripe';
import { resolveFantasyManagerAuth } from '@/lib/fantasy-manager-auth';
import { resolveRequestSeason } from '@/lib/fantasy-seasons';
import { getDinoCoachSettings } from '@/lib/dino-coach/server';
import { createServerClient } from '@/lib/supabase-server';
import { getStripe } from '@/lib/stripe';
import { isCheckoutEnabled } from '@/lib/payments/payment-config';
import { isCanonicalPaymentReference } from '@/lib/payments/reference';
import { getCheckoutSiteUrl } from '@/lib/payments/site-url';
import { enforceRateLimit } from '@/lib/server/request-guards';
import { PUBLIC_ORDER_LIMITS, readLimitedJsonObject } from '@/lib/order-input-validation';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isCheckoutEnabled()) return NextResponse.json({ success: false, error: 'Card payments are not currently enabled.' }, { status: 503 });
  const { auth, errorMessage, errorStatus } = await resolveFantasyManagerAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: errorMessage }, { status: errorStatus });
  if (!enforceRateLimit(`dino-checkout:${auth.manager.id}`, 8, 60_000)) {
    return NextResponse.json({ success: false, error: 'Too many payment attempts. Please wait and try again.' }, { status: 429 });
  }
  const rawBody = await readLimitedJsonObject(request, 8 * 1024);
  if (!rawBody.ok) {
    const status = rawBody.error === 'Request body is too large.' ? 413 : 400;
    return NextResponse.json({ success: false, error: rawBody.error }, { status });
  }
  const season = await resolveRequestSeason(request, rawBody.value);
  if (!season) return NextResponse.json({ success: false, error: 'No Dino Coach season is available.' }, { status: 404 });
  const settings = await getDinoCoachSettings(season.id);
  if (!settings.public_launch_enabled || !settings.registration_open) return NextResponse.json({ success: false, error: 'Dino Coach registration is closed.' }, { status: 403 });
  if (!Number.isSafeInteger(settings.entry_fee_cents) || settings.entry_fee_cents <= 0
    || settings.entry_fee_cents > PUBLIC_ORDER_LIMITS.maximumOrderCents
    || String(settings.entry_fee_currency).toLowerCase() !== 'aud') {
    return NextResponse.json({ success: false, error: 'Dino Coach AUD pricing is unavailable.' }, { status: 503 });
  }
  const siteUrl = getCheckoutSiteUrl(request);
  if (!siteUrl) return NextResponse.json({ success: false, error: 'Secure checkout return URLs are not configured.' }, { status: 503 });

  const supabase = createServerClient();
  const { data: manager } = await supabase.from('fantasy_managers')
    .select('id,email,age_verified_at,team_name_status,rules_version_accepted,is_active')
    .eq('id', auth.manager.id).single();
  if (!manager?.is_active || !manager.age_verified_at || manager.team_name_status !== 'approved' || manager.rules_version_accepted !== settings.rules_version) {
    return NextResponse.json({ success: false, error: 'Complete age, rules and team-name eligibility before payment.' }, { status: 403 });
  }
  const inserted = await supabase.from('fantasy_entries').upsert({
    manager_id: manager.id, season_id: season.id, entry_fee_cents: settings.entry_fee_cents, currency: settings.entry_fee_currency,
    metadata: { product: 'Dino Coach', rules_version: settings.rules_version },
  }, { onConflict: 'manager_id,season_id', ignoreDuplicates: true }).select('*').maybeSingle();
  if (inserted.error) return NextResponse.json({ success: false, error: 'Could not create Dino Coach entry.' }, { status: 500 });
  const entryLookup = inserted.data ? null : await supabase.from('fantasy_entries').select('*')
    .eq('manager_id', manager.id).eq('season_id', season.id).single();
  const entry = inserted.data || entryLookup?.data;
  if (entryLookup?.error || !entry) return NextResponse.json({ success: false, error: 'Could not load Dino Coach entry.' }, { status: 500 });
  if (!Number.isSafeInteger(entry.entry_fee_cents) || entry.entry_fee_cents <= 0
    || entry.entry_fee_cents > PUBLIC_ORDER_LIMITS.maximumOrderCents
    || String(entry.currency).toLowerCase() !== 'aud') {
    return NextResponse.json({ success: false, error: 'The Dino Coach entry has invalid AUD pricing.' }, { status: 503 });
  }
  const payableStatuses = ['payment_required', 'pending', 'failed', 'expired'];
  if (!payableStatuses.includes(entry.status)) {
    return NextResponse.json({ success: false, error: 'This Dino Coach entry is not currently payable.' }, { status: 409 });
  }
  const ensuredReference = await supabase.rpc('ensure_fantasy_entry_payment_reference', { target_entry_id: entry.id });
  const paymentReference = ensuredReference.data;
  if (ensuredReference.error || !isCanonicalPaymentReference(paymentReference, 'dino_coach')) {
    return NextResponse.json({ success: false, error: 'Could not allocate the Dino Coach payment reference.' }, { status: 500 });
  }
  if (entry.stripe_checkout_session_id) {
    const existing = await getStripe().checkout.sessions.retrieve(entry.stripe_checkout_session_id).catch(() => null);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'The existing payment attempt could not be verified.' }, { status: 503 });
    }
    const existingMetadata = existing.metadata || {};
    const existingContractValid = existing.status === 'open'
      && Boolean(existing.url)
      && existing.mode === 'payment'
      && existing.amount_total === entry.entry_fee_cents
      && existing.currency?.toLowerCase() === 'aud'
      && existing.client_reference_id === paymentReference
      && existingMetadata.ndcc_reference_version === '1'
      && existingMetadata.ndcc_payment_reference === paymentReference
      && existingMetadata.item_number === paymentReference
      && existingMetadata.ndcc_payment_type === 'dino_coach'
      && existingMetadata.ndcc_order_id === entry.id
      && existingMetadata.payment_reference === paymentReference
      && existingMetadata.product === 'Dino Coach'
      && existingMetadata.entry_id === entry.id
      && existingMetadata.manager_id === manager.id
      && existingMetadata.season_id === season.id
      && existingMetadata.rules_version === settings.rules_version
      && existingMetadata.expected_amount_cents === String(entry.entry_fee_cents);
    if (existingContractValid && existing.url) {
      return NextResponse.json({ success: true, url: existing.url, payment_reference: paymentReference, reused: true });
    }
    if (existing.status === 'complete') {
      return NextResponse.json({ success: false, error: 'This payment is already being confirmed. Please refresh before trying again.' }, { status: 409 });
    }
    if (existing.status === 'open') {
      const expired = await getStripe().checkout.sessions.expire(existing.id).catch(() => null);
      if (!expired || expired.status !== 'expired') {
        return NextResponse.json(
          { success: false, error: 'The existing payment attempt is invalid and could not be safely expired.' },
          { status: 503 },
        );
      }
    } else if (existing.status !== 'expired') {
      return NextResponse.json({ success: false, error: 'The existing payment attempt is in an unsupported state.' }, { status: 503 });
    }
  }

  const paymentMetadata = {
    ndcc_payment_reference: paymentReference,
    ndcc_payment_type: 'dino_coach',
    ndcc_order_id: entry.id,
    ndcc_reference_version: '1',
    item_number: paymentReference,
    product: 'Dino Coach',
    manager_id: manager.id,
    season_id: season.id,
    entry_id: entry.id,
    rules_version: settings.rules_version,
    expected_amount_cents: String(entry.entry_fee_cents),
    payment_reference: paymentReference,
  };
  const checkoutParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment', client_reference_id: paymentReference, customer_email: manager.email,
    line_items: [{ price_data: { currency: String(entry.currency).toLowerCase(), unit_amount: entry.entry_fee_cents,
      product_data: { name: `Dino Coach 2026/2027 entry - ${paymentReference}`, description: 'Newcomb & District Cricket Club participation fee' } }, quantity: 1 }],
    success_url: `${siteUrl}/fantasy/account?payment=submitted&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/fantasy/account?payment=cancelled`,
    metadata: paymentMetadata,
    payment_intent_data: { description: `${paymentReference} - NDCC Dino Coach`, metadata: paymentMetadata },
  };
  const payloadDigest = createHash('sha256')
    .update(JSON.stringify(checkoutParams))
    .digest('hex')
    .slice(0, 32);
  const predecessorSession = entry.stripe_checkout_session_id || 'first';
  const stripe = getStripe();
  let session = await stripe.checkout.sessions.create(checkoutParams, {
    idempotencyKey: `ndcc:dino:v2:${entry.id}:${predecessorSession}:${payloadDigest}`,
  });
  // A previous response may have been lost after its Session was subsequently
  // expired during ledger-link cleanup. Reusing the original key correctly
  // returns that expired Session; scope one recovery attempt to its immutable
  // ID so the replacement request remains deterministic as well.
  if (session.status === 'expired') {
    session = await stripe.checkout.sessions.create(checkoutParams, {
      idempotencyKey: `ndcc:dino:v2:${entry.id}:${session.id}:${payloadDigest}`,
    });
  }
  if (session.status !== 'open' || !session.url
    || session.metadata?.ndcc_payment_reference !== paymentReference
    || session.metadata?.item_number !== paymentReference
    || session.metadata?.ndcc_reference_version !== '1'
    || session.metadata?.ndcc_payment_type !== 'dino_coach'
    || session.metadata?.ndcc_order_id !== entry.id
    || session.metadata?.payment_reference !== paymentReference
    || session.metadata?.entry_id !== entry.id
    || session.metadata?.product !== 'Dino Coach'
    || session.metadata?.manager_id !== manager.id
    || session.metadata?.season_id !== season.id
    || session.metadata?.rules_version !== settings.rules_version
    || session.metadata?.expected_amount_cents !== String(entry.entry_fee_cents)
    || session.client_reference_id !== paymentReference
    || session.amount_total !== entry.entry_fee_cents
    || session.currency?.toLowerCase() !== 'aud'
    || session.mode !== 'payment') {
    return NextResponse.json({ success: false, error: 'Stripe did not return a verified Checkout session.' }, { status: 502 });
  }
  const recorded = await supabase.from('fantasy_entries').update({ status: 'pending', stripe_checkout_session_id: session.id })
    .eq('id', entry.id).in('status', ['payment_required','pending','failed','expired']).select('id').maybeSingle();
  if (recorded.error || !recorded.data) {
    await getStripe().checkout.sessions.expire(session.id).catch(() => undefined);
    return NextResponse.json({ success: false, error: recorded.error ? 'Could not record the Checkout session.' : 'This Dino Coach entry is no longer payable.' }, { status: recorded.error ? 500 : 409 });
  }
  return NextResponse.json({ success: true, url: session.url, payment_reference: paymentReference });
}

import { configuredBankDetails } from '@/lib/payments/bank-transfer';
import { deriveCapabilities, loadMerchPaymentSettings } from '@/lib/payments/capabilities';
import { sendBankTransferInstructions } from '@/lib/payments/bank-transfer-email';
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
import { buildPaymentCheckoutSessionParams, createPaymentCheckoutSession } from '@/lib/payments/stripe-checkout';
import { enforceRateLimit } from '@/lib/server/request-guards';
import { PUBLIC_ORDER_LIMITS, readLimitedJsonObject } from '@/lib/order-input-validation';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {

  const { auth, errorMessage, errorStatus } = await resolveFantasyManagerAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: errorMessage }, { status: errorStatus });
  if (!await enforceRateLimit(`dino-checkout:${auth.manager.id}`, 8, 60_000)) {
    return NextResponse.json({ success: false, error: 'Too many payment attempts. Please wait and try again.' }, { status: 429 });
  }
  const rawBody = await readLimitedJsonObject(request, 8 * 1024);
  if (!rawBody.ok) {
    const status = rawBody.error === 'Request body is too large.' ? 413 : 400;
    return NextResponse.json({ success: false, error: rawBody.error }, { status });
  }
  const method = rawBody.value.payment_method || 'stripe';
  if (method !== 'stripe' && method !== 'bank_transfer') return NextResponse.json({ error: 'Choose a valid payment method.' }, { status: 400 });
  if (method === 'stripe' && !isCheckoutEnabled()) return NextResponse.json({ error: 'Card payments are not currently enabled.' }, { status: 503 });
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
  if (method === 'stripe' && !siteUrl) return NextResponse.json({ success: false, error: 'Secure checkout return URLs are not configured.' }, { status: 503 });

  const supabase = createServerClient();
  if (method === 'bank_transfer' && !deriveCapabilities(await loadMerchPaymentSettings(supabase), 'dino').bank_transfer) return NextResponse.json({ error: 'Bank transfers are currently unavailable.' }, { status: 503 });
  const { data: manager } = await supabase.from('fantasy_managers')
    .select('id,email,age_verified_at,team_name_status,rules_version_accepted,is_active')
    .eq('id', auth.manager.id).single();
  if (!manager?.is_active || !manager.age_verified_at || !['approved', 'replaced'].includes(manager.team_name_status) || manager.rules_version_accepted !== settings.rules_version) {
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
  if (entry.is_demo || entry.fee_waived) {
    // Retire any earlier unpaid Checkout link when demo access is enabled.
    if (entry.stripe_checkout_session_id) {
      const existing = await getStripe().checkout.sessions.retrieve(entry.stripe_checkout_session_id).catch(() => null);
      if (!existing) return NextResponse.json({ success: false, error: 'Could not verify the earlier demo checkout.' }, { status: 503 });
      if (existing.status === 'open') {
        const expired = await getStripe().checkout.sessions.expire(existing.id).catch(() => null);
        if (expired?.status !== 'expired') return NextResponse.json({ success: false, error: 'Could not close the earlier demo checkout.' }, { status: 503 });
      }
    }
    return NextResponse.json({ success: false, error: 'No payment is required for this entry; you can pick your team.' }, { status: 409 });
  }
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
  if (method === 'bank_transfer') {
    if (entry.stripe_checkout_session_id || entry.stripe_payment_intent_id) return NextResponse.json({ error: 'A card payment has already been started. Contact the club to change it to bank deposit.' }, { status: 409 });
    // Only the request that records a new selection emails the instructions;
    // retries and repeat clicks keep the stored timestamp and send nothing.
    const selectedAt = entry.bank_transfer_selected_at || new Date().toISOString();
    let selection = supabase.from('fantasy_entries').update({ bank_transfer_selected_at: selectedAt })
      .eq('id', entry.id).in('status', payableStatuses).is('stripe_checkout_session_id', null).is('stripe_payment_intent_id', null);
    if (!entry.bank_transfer_selected_at) selection = selection.is('bank_transfer_selected_at', null);
    let selected = await selection.select('id').maybeSingle();
    let newlySelected = !entry.bank_transfer_selected_at;
    if (!selected.error && !selected.data && newlySelected) {
      // A concurrent request recorded the selection first; it sends the email.
      selected = await supabase.from('fantasy_entries').select('id').eq('id', entry.id).in('status', payableStatuses)
        .not('bank_transfer_selected_at', 'is', null).is('stripe_checkout_session_id', null).is('stripe_payment_intent_id', null).maybeSingle();
      newlySelected = false;
    }
    if (selected.error || !selected.data) return NextResponse.json({ error: 'The entry changed or the payment choice could not be saved. Refresh and retry.' }, { status: 409 });
    let emailed = false;
    if (newlySelected) {
      try {
        const sent = await sendBankTransferInstructions({ kind: 'dino', sourceId: entry.id, to: manager.email, name: auth.manager.display_name || 'Dino Coach', reference: paymentReference,
          amountCents: entry.entry_fee_cents, productLabel: `${season.name} entry`, selectedAt });
        emailed = sent.status === 'sent';
      } catch (emailError) {
        console.error('Dino bank deposit instructions email failed:', emailError);
      }
    }
    return NextResponse.json({ success: true, bank_transfer: true, order_id: entry.id, total_amount: entry.entry_fee_cents / 100, payment_reference: paymentReference, bank_details: configuredBankDetails(), ...(emailed ? { instructions_emailed: true } : {}) }, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (entry.bank_transfer_selected_at) return NextResponse.json({ error: 'Bank transfer is selected for this entry. Contact the club before paying again by card.' }, { status: 409 });
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
      && existingMetadata.receipt_email_version === '1'
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
    receipt_email_version: '1',
    item_number: paymentReference,
    product: 'Dino Coach',
    manager_id: manager.id,
    season_id: season.id,
    entry_id: entry.id,
    rules_version: settings.rules_version,
    expected_amount_cents: String(entry.entry_fee_cents),
    payment_reference: paymentReference,
  };
  const checkoutParams: Stripe.Checkout.SessionCreateParams = buildPaymentCheckoutSessionParams({
    client_reference_id: paymentReference, customer_email: manager.email,
    line_items: [{ price_data: { currency: String(entry.currency).toLowerCase(), unit_amount: entry.entry_fee_cents,
      product_data: { name: `${season.name} entry - ${paymentReference}`, description: 'Newcomb & District Cricket Club participation fee' } }, quantity: 1 }],
    success_url: `${siteUrl}/fantasy/account?payment=submitted&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/fantasy/account?payment=cancelled`,
    metadata: paymentMetadata,
    payment_intent_data: { receipt_email: manager.email, description: `${paymentReference} - NDCC Dino Coach`, metadata: paymentMetadata },
  });
  const payloadDigest = createHash('sha256')
    .update(JSON.stringify(checkoutParams))
    .digest('hex')
    .slice(0, 32);
  const predecessorSession = entry.stripe_checkout_session_id || 'first';
  const stripe = getStripe();
  let session = await createPaymentCheckoutSession(
    stripe,
    checkoutParams,
    `ndcc:dino:v2:${entry.id}:${predecessorSession}:${payloadDigest}`,
  );
  // A previous response may have been lost after its Session was subsequently
  // expired during ledger-link cleanup. Reusing the original key correctly
  // returns that expired Session; scope one recovery attempt to its immutable
  // ID so the replacement request remains deterministic as well.
  if (session.status === 'expired') {
    session = await createPaymentCheckoutSession(
      stripe,
      checkoutParams,
      `ndcc:dino:v2:${entry.id}:${session.id}:${payloadDigest}`,
    );
  }
  if (session.status !== 'open' || !session.url
    || session.metadata?.ndcc_payment_reference !== paymentReference
    || session.metadata?.item_number !== paymentReference
    || session.metadata?.ndcc_reference_version !== '1'
    || session.metadata?.receipt_email_version !== '1'
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
    .eq('id', entry.id).is('bank_transfer_selected_at', null).in('status', ['payment_required','pending','failed','expired']).select('id').maybeSingle();
  if (recorded.error || !recorded.data) {
    await getStripe().checkout.sessions.expire(session.id).catch(() => undefined);
    return NextResponse.json({ success: false, error: recorded.error ? 'Could not record the Checkout session.' : 'This Dino Coach entry is no longer payable.' }, { status: recorded.error ? 500 : 409 });
  }
  return NextResponse.json({ success: true, url: session.url, payment_reference: paymentReference });
}

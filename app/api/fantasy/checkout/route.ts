import { NextResponse } from 'next/server';
import { resolveFantasyManagerAuth } from '@/lib/fantasy-manager-auth';
import { resolveRequestSeason } from '@/lib/fantasy-seasons';
import { getDinoCoachSettings } from '@/lib/dino-coach/server';
import { createServerClient } from '@/lib/supabase-server';
import { getStripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const { auth, errorMessage, errorStatus } = await resolveFantasyManagerAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: errorMessage }, { status: errorStatus });
  const season = await resolveRequestSeason(request, await request.json().catch(() => ({})));
  if (!season) return NextResponse.json({ success: false, error: 'No Dino Coach season is available.' }, { status: 404 });
  const settings = await getDinoCoachSettings(season.id);
  if (!settings.public_launch_enabled || !settings.registration_open) return NextResponse.json({ success: false, error: 'Dino Coach registration is closed.' }, { status: 403 });

  const supabase = createServerClient();
  const { data: manager } = await supabase.from('fantasy_managers')
    .select('id,email,age_verified_at,team_name_status,rules_version_accepted,is_active')
    .eq('id', auth.manager.id).single();
  if (!manager?.is_active || !manager.age_verified_at || manager.team_name_status !== 'approved' || manager.rules_version_accepted !== settings.rules_version) {
    return NextResponse.json({ success: false, error: 'Complete age, rules and team-name eligibility before payment.' }, { status: 403 });
  }
  const found = await supabase.from('fantasy_entries').select('*').eq('manager_id', manager.id).eq('season_id', season.id).maybeSingle();
  const created = found.data ? null : await supabase.from('fantasy_entries').insert({
    manager_id: manager.id, season_id: season.id, entry_fee_cents: settings.entry_fee_cents, currency: settings.entry_fee_currency,
    metadata: { product: 'Dino Coach', rules_version: settings.rules_version },
  }).select('*').single();
  const entry = found.data || created?.data;
  const entryError = found.error || created?.error;
  if (entryError || !entry) return NextResponse.json({ success: false, error: entryError?.message || 'Could not create Dino Coach entry.' }, { status: 500 });
  if (entry.status === 'paid') return NextResponse.json({ success: false, error: 'This Dino Coach entry is already paid.' }, { status: 409 });
  if (entry.stripe_checkout_session_id && ['pending','payment_required'].includes(entry.status)) {
    const existing = await getStripe().checkout.sessions.retrieve(entry.stripe_checkout_session_id).catch(() => null);
    if (existing?.status === 'open' && existing.url) return NextResponse.json({ success: true, url: existing.url, reused: true });
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const session = await getStripe().checkout.sessions.create({
    mode: 'payment', client_reference_id: entry.id, customer_email: manager.email,
    line_items: [{ price_data: { currency: settings.entry_fee_currency.toLowerCase(), unit_amount: settings.entry_fee_cents,
      product_data: { name: 'Dino Coach 2026/2027 entry', description: 'Newcomb & District Cricket Club participation fee' } }, quantity: 1 }],
    success_url: `${siteUrl}/fantasy/account?payment=submitted&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/fantasy/account?payment=cancelled`, expires_at: Math.floor(Date.now() / 1000) + 3600,
    metadata: { product: 'Dino Coach', manager_id: manager.id, season_id: season.id, entry_id: entry.id,
      rules_version: settings.rules_version, expected_amount_cents: String(settings.entry_fee_cents) },
    payment_intent_data: { metadata: { product: 'Dino Coach', manager_id: manager.id, season_id: season.id, entry_id: entry.id } },
  }, { idempotencyKey: `dino-coach:${entry.id}:${settings.rules_version}:${settings.entry_fee_cents}` });
  if (!session.url) return NextResponse.json({ success: false, error: 'Stripe did not return a Checkout URL.' }, { status: 502 });
  const { error } = await supabase.from('fantasy_entries').update({ status: 'pending', stripe_checkout_session_id: session.id }).eq('id', entry.id).in('status', ['payment_required','failed','expired']);
  if (error) { await getStripe().checkout.sessions.expire(session.id).catch(() => undefined); return NextResponse.json({ success: false, error: 'Could not record the Checkout session.' }, { status: 500 }); }
  return NextResponse.json({ success: true, url: session.url });
}

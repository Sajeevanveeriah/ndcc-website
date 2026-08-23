import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getStripe } from '@/lib/stripe';
import { enforceRateLimit, getClientIp } from '@/lib/server/request-guards';
import { getPublicRaffleCampaign } from '@/lib/raffle-visibility';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!enforceRateLimit(`raffle:${getClientIp(request)}`, 8, 60_000)) return NextResponse.json({ error: 'Too many attempts. Please wait and try again.' }, { status: 429 });
    const body = await request.json();
    const name = String(body.name || '').trim(); const email = String(body.email || '').trim().toLowerCase(); const phone = String(body.phone || '').trim(); const quantity = Number(body.quantity);
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) return NextResponse.json({ error: 'Enter a valid name, email and quantity from 1 to 20.' }, { status: 400 });
    const db = createServerClient();
    const campaign = await getPublicRaffleCampaign();
    if (!campaign) return NextResponse.json({ error: 'The raffle is not currently available.' }, { status: 503 });
    const amount = campaign.price_cents * quantity;
    const { data: order, error: orderError } = await db.from('raffle_orders').insert({ campaign_id: campaign.id, customer_name: name, customer_email: email, customer_phone: phone || null, quantity, amount_cents: amount }).select('id').single();
    if (orderError || !order) return NextResponse.json({ error: 'The raffle order could not be created.' }, { status: 500 });
    const site = (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
    const session = await getStripe().checkout.sessions.create({ mode: 'payment', customer_email: email,
      line_items: [{ price_data: { currency: 'aud', unit_amount: campaign.price_cents, product_data: { name: 'NDCC Dinos Trailer Raffle Ticket', description: 'Drawn 19 December 2026 at the Christmas Party' } }, quantity }],
      success_url: `${site}/raffle?payment=success`, cancel_url: `${site}/raffle?payment=cancelled`, client_reference_id: order.id,
      metadata: { product: 'NDCC Raffle', raffle_order_id: order.id, expected_amount_cents: String(amount), quantity: String(quantity) },
    }, { idempotencyKey: `raffle-${order.id}` });
    await db.from('raffle_orders').update({ stripe_checkout_session_id: session.id }).eq('id', order.id);
    return NextResponse.json({ checkout_url: session.url });
  } catch (error) {
    console.error('Raffle checkout failed:', error);
    return NextResponse.json({ error: 'Secure checkout could not be started.' }, { status: 500 });
  }
}

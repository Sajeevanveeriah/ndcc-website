import { createServerClient } from '@/lib/supabase-server';
import { getStripe } from '@/lib/stripe';
import { NextResponse } from 'next/server';
import { enforceHoneypotAndTiming, enforceRateLimit, getClientIp } from '@/lib/server/request-guards';
import { isCheckoutEnabled } from '@/lib/payments/payment-config';
import { loadPricedCatalogue, priceOrderItems, type PostedOrderItem as PostedItem } from '@/lib/apparel/server-catalogue';

export const dynamic = 'force-dynamic';

function sanitiseInput(str: string): string {
  return str.replace(/<[^>]*>/g, '').trim();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: Request) {
  try {
    // Online checkout stays dormant unless the club has explicitly selected
    // the stripe_checkout provider AND configured a secret key. A leftover
    // STRIPE_SECRET_KEY on its own must never arm this endpoint.
    if (!isCheckoutEnabled()) {
      return NextResponse.json(
        { success: false, error: 'Online checkout is not enabled.' },
        { status: 503 }
      );
    }

    const body = await request.json();

    const { customer_name, customer_email, customer_phone, items, total_amount, notes, hp_field, submitted_at } = body;

    const ip = getClientIp(request);
    if (!enforceRateLimit(`checkout:${ip}`, 6, 60_000)) {
      return NextResponse.json(
        { success: false, error: 'Too many checkout attempts. Please wait and try again.' },
        { status: 429 }
      );
    }

    if (!enforceHoneypotAndTiming(hp_field, submitted_at)) {
      return NextResponse.json({ success: false, error: 'Invalid form submission.' }, { status: 400 });
    }

    if (!customer_name || !customer_email || !items || !total_amount) {
      return NextResponse.json(
        { success: false, error: 'Customer name, email, items, and total amount are required.' },
        { status: 400 }
      );
    }

    if (!isValidEmail(customer_email)) {
      return NextResponse.json(
        { success: false, error: 'Please provide a valid email address.' },
        { status: 400 }
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Order must contain at least one item.' },
        { status: 400 }
      );
    }

    if (typeof total_amount !== 'number' || total_amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Total amount must be a positive number.' },
        { status: 400 }
      );
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { success: false, error: 'Service not configured.' },
        { status: 503 }
      );
    }

    const supabase = createServerClient();

    // Never trust client prices: resolve every posted item against the live
    // catalogue (base price + selected option surcharges) and recompute the
    // total server-side. Unknown items or invalid options reject the request;
    // a client/server price disagreement asks the buyer to refresh.
    const catalogue = await loadPricedCatalogue(supabase);
    if (!catalogue.ok) {
      console.error('Checkout catalogue lookup failed:', catalogue.error);
      return NextResponse.json(
        { success: false, error: 'Unable to verify product pricing. Please try again later.' },
        { status: 503 }
      );
    }

    const priced = priceOrderItems(catalogue.products, items as PostedItem[], { maxQuantity: 50 });
    if (!priced.ok) {
      return NextResponse.json({ success: false, error: priced.error }, { status: 400 });
    }
    if (priced.clientPriceMismatches.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Prices have changed. Please refresh the page and try again.' },
        { status: 400 }
      );
    }

    const verifiedItems = priced.items;
    const serverTotal = priced.totalAmount;

    // Save order to Supabase with pending status
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_name: sanitiseInput(customer_name),
        customer_email: sanitiseInput(customer_email),
        customer_phone: customer_phone ? sanitiseInput(customer_phone) : '',
        items: verifiedItems,
        total_amount: serverTotal,
        payment_status: 'pending',
        processed: false,
        notes: notes ? sanitiseInput(notes) : '',
      })
      .select('id')
      .single();

    if (orderError || !order) {
      console.error('Supabase order insert error:', orderError);
      return NextResponse.json(
        { success: false, error: 'Failed to create order.' },
        { status: 500 }
      );
    }

    // Create Stripe Checkout Session from server-verified prices only
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    const lineItems = verifiedItems.map((item) => ({
      price_data: {
        currency: 'aud',
        product_data: {
          name: item.name,
          description: [
            `Size: ${item.size || 'One Size'}`,
            ...(item.applied_options || []).map((o) => `${o.group}: ${o.label}`),
          ].join(', '),
        },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.quantity,
    }));

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${siteUrl}/merchandise?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/merchandise?cancelled=true`,
      customer_email: sanitiseInput(customer_email),
      metadata: {
        order_id: order.id,
      },
    });

    // Update order with Stripe session ID
    await supabase
      .from('orders')
      .update({ stripe_session_id: session.id })
      .eq('id', order.id);

    return NextResponse.json({
      success: true,
      checkout_url: session.url,
    });
  } catch (err) {
    console.error('Checkout route error:', err);
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}

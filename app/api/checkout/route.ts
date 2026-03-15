import { createServerClient } from '@/lib/supabase-server';
import { getStripe } from '@/lib/stripe';
import { NextResponse } from 'next/server';

function sanitiseInput(str: string): string {
  return str.replace(/<[^>]*>/g, '').trim();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { customer_name, customer_email, customer_phone, items, total_amount, notes } = body;

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

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { success: false, error: 'Payment service not configured.' },
        { status: 503 }
      );
    }

    const supabase = createServerClient();

    // Save order to Supabase with pending status
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_name: sanitiseInput(customer_name),
        customer_email: sanitiseInput(customer_email),
        customer_phone: customer_phone ? sanitiseInput(customer_phone) : '',
        items,
        total_amount,
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

    // Create Stripe Checkout Session
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    const lineItems = items.map((item: { name: string; size: string; quantity: number; price: number }) => ({
      price_data: {
        currency: 'aud',
        product_data: {
          name: item.name,
          description: `Size: ${item.size}`,
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

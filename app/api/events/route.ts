import { createServerClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { validateEmail, validatePhone } from '@/lib/utils';
import { generateUniquePaymentReference } from '@/lib/payments/reference';

function sanitiseInput(str: string): string {
  return str.replace(/<[^>]*>/g, '').trim();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { event_id, name, email, phone, quantity } = body;

    if (!event_id || !name || !email) {
      return NextResponse.json(
        { success: false, error: 'Event ID, name, and email are required.' },
        { status: 400 }
      );
    }

    if (!validateEmail(email)) {
      return NextResponse.json(
        { success: false, error: 'Please provide a valid email address.' },
        { status: 400 }
      );
    }
    if (!phone || !validatePhone(phone)) {
      return NextResponse.json(
        { success: false, error: 'Please provide a valid phone number.' },
        { status: 400 }
      );
    }

    const qty = typeof quantity === 'number' && quantity > 0 ? quantity : 1;

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { success: false, error: 'Service not configured.' },
        { status: 503 }
      );
    }

    const supabase = createServerClient();

    const paymentReference = await generateUniquePaymentReference();

    const { error } = await supabase.from('event_registrations').insert({
      event_id: sanitiseInput(event_id),
      name: sanitiseInput(name),
      email: sanitiseInput(email),
      phone: sanitiseInput(phone),
      quantity: qty,
      payment_status: 'pending_bank_transfer',
      payment_reference: paymentReference,
    });

    if (error) {
      console.error('Supabase event registration insert error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to register for event.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Registration confirmed!',
      payment_reference: paymentReference,
      bank_details: {
        account_name: process.env.NDCC_BANK_ACCOUNT_NAME || '',
        bsb: process.env.NDCC_BANK_BSB || '',
        account_number: process.env.NDCC_BANK_ACCOUNT_NUMBER || '',
      },
    });
  } catch (err) {
    console.error('Event registration route error:', err);
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}

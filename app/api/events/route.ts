import { createServerClient } from '@/lib/supabase-server';
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

    const { event_id, name, email, quantity } = body;

    if (!event_id || !name || !email) {
      return NextResponse.json(
        { success: false, error: 'Event ID, name, and email are required.' },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { success: false, error: 'Please provide a valid email address.' },
        { status: 400 }
      );
    }

    const qty = typeof quantity === 'number' && quantity > 0 ? quantity : 1;

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.warn('Supabase not configured - returning mock response');
      return NextResponse.json({
        success: true,
        message: 'Registration confirmed!',
      });
    }

    const supabase = createServerClient();

    const { error } = await supabase.from('event_registrations').insert({
      event_id: sanitiseInput(event_id),
      name: sanitiseInput(name),
      email: sanitiseInput(email),
      quantity: qty,
      payment_status: 'pending',
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
    });
  } catch (err) {
    console.error('Event registration route error:', err);
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}

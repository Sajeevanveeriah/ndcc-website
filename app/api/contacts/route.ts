import { createServerClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { enforceHoneypotAndTiming, enforceRateLimit, getClientIp } from '@/lib/server/request-guards';

function sanitiseInput(str: string): string {
  return str.replace(/<[^>]*>/g, '').trim();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { name, email, message, enquiry_type, hp_field, submitted_at } = body;

    const ip = getClientIp(request);
    if (!enforceRateLimit(`contact:${ip}`, 8, 60_000)) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429 }
      );
    }

    if (!enforceHoneypotAndTiming(hp_field, submitted_at)) {
      return NextResponse.json({ success: false, error: 'Invalid form submission.' }, { status: 400 });
    }

    if (!name || !email || !message) {
      return NextResponse.json(
        { success: false, error: 'Name, email, and message are required.' },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { success: false, error: 'Please provide a valid email address.' },
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

    const { error } = await supabase.from('contacts').insert({
      name: sanitiseInput(name),
      email: sanitiseInput(email),
      message: sanitiseInput(message),
      enquiry_type: enquiry_type ? sanitiseInput(enquiry_type) : 'general',
      responded: false,
    });

    if (error) {
      console.error('Supabase contact insert error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to send message.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Message sent successfully!',
    });
  } catch (err) {
    console.error('Contact route error:', err);
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}

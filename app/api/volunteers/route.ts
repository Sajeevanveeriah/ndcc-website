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

    const { name, email, role, phone, availability } = body;

    if (!name || !email || !role) {
      return NextResponse.json(
        { success: false, error: 'Name, email, and role are required.' },
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

    const { error } = await supabase.from('volunteers').insert({
      name: sanitiseInput(name),
      email: sanitiseInput(email),
      phone: phone ? sanitiseInput(phone) : '',
      role: sanitiseInput(role),
      availability: availability ? sanitiseInput(availability) : '',
      processed: false,
    });

    if (error) {
      console.error('Supabase volunteer insert error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to submit volunteer registration.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Thank you for volunteering!',
    });
  } catch (err) {
    console.error('Volunteer route error:', err);
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}

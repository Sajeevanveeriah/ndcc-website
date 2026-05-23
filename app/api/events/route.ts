import { createServerClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { validateEmail, validatePhone } from '@/lib/utils';
import { generateUniquePaymentReference } from '@/lib/payments/reference';
import { sendEmail, emailHtml, bankDetailsHtml } from '@/lib/email';

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

    const { data: eventRow } = await supabase
      .from('events')
      .select('title, event_date, ticket_price, location')
      .eq('id', sanitiseInput(event_id))
      .maybeSingle();
    const isPaid = eventRow?.ticket_price && Number(eventRow.ticket_price) > 0;
    const totalCost = isPaid ? Number(eventRow.ticket_price) * qty : 0;
    void sendEmail({
      to: sanitiseInput(email),
      subject: `Event registration confirmed — ${eventRow?.title || 'NDCC Event'} | NDCC Dinos`,
      html: emailHtml(
        'Registration Confirmed',
        `<p style="font-size:15px;color:#374151;line-height:1.6;">Hi ${sanitiseInput(name)},</p>
        <p style="font-size:15px;color:#374151;line-height:1.6;">You are registered for <strong>${eventRow?.title || 'this event'}</strong>${eventRow?.event_date ? ` on ${new Date(eventRow.event_date).toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}.</p>
        ${eventRow?.location ? `<p style="font-size:14px;color:#374151;"><strong>Location:</strong> ${eventRow.location}</p>` : ''}
        <p style="font-size:14px;color:#374151;"><strong>Tickets:</strong> ${qty}</p>
        ${isPaid
          ? bankDetailsHtml(paymentReference, totalCost)
          : `<div style="background:#f0fdf4;border-radius:6px;padding:16px;margin:16px 0;"><p style="margin:0;font-size:14px;color:#166534;font-weight:bold;">Free entry — no payment required.</p></div>`
        }
        <p style="font-size:13px;color:#6b7280;">Questions? Contact us at <a href="mailto:ndcc.secretary1@gmail.com" style="color:#800000;">ndcc.secretary1@gmail.com</a>.</p>`
      ),
    });
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

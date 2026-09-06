import { createServerClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { enforceHoneypotAndTiming, enforceRateLimit, getClientIp } from '@/lib/server/request-guards';
import { validateEmail, validatePhone } from '@/lib/utils';
import { generateUniquePaymentReference } from '@/lib/payments/reference';
import { sendEmail, emailHtml, bankDetailsHtml, escapeEmailHtml } from '@/lib/email';
import {
  PUBLIC_ORDER_LIMITS,
  audAmountToCents,
  readLimitedJsonObject,
} from '@/lib/order-input-validation';

export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sanitiseInput(str: string): string {
  return str.replace(/<[^>]*>/g, '').trim();
}

export async function POST(request: Request) {
  try {
    const parsedBody = await readLimitedJsonObject(request, 16 * 1024);
    if (!parsedBody.ok) {
      return NextResponse.json(
        { success: false, error: parsedBody.error },
        { status: parsedBody.error === 'Request body is too large.' ? 413 : 400 },
      );
    }
    const body = parsedBody.value;

    const { event_id, name, email, phone, quantity, hp_field, submitted_at } = body;

    if (typeof event_id !== 'string' || !UUID_PATTERN.test(event_id)
      || typeof name !== 'string' || !name.trim() || name.trim().length > PUBLIC_ORDER_LIMITS.nameLength
      || typeof email !== 'string' || !email.trim() || email.trim().length > PUBLIC_ORDER_LIMITS.emailLength
      || typeof phone !== 'string' || !phone.trim() || phone.trim().length > PUBLIC_ORDER_LIMITS.phoneLength
      || typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20
      || typeof hp_field !== 'string' || hp_field.length > 200
      || typeof submitted_at !== 'number' || !Number.isFinite(submitted_at) || submitted_at <= 0) {
      return NextResponse.json(
        { success: false, error: 'One or more event registration details are invalid.' },
        { status: 400 },
      );
    }

    const ip = getClientIp(request);
    if (!enforceRateLimit(`event:${ip}`, 8, 60_000)) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429 }
      );
    }

    if (!enforceHoneypotAndTiming(hp_field, submitted_at)) {
      return NextResponse.json({ success: false, error: 'Invalid form submission.' }, { status: 400 });
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

    const qty = quantity;

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { success: false, error: 'Service not configured.' },
        { status: 503 }
      );
    }

    const supabase = createServerClient();
    const safeEventId = sanitiseInput(event_id);

    const { data: eventRow, error: eventError } = await supabase
      .from('events')
      .select('id,title,event_date,ticket_price,location')
      .eq('id', safeEventId)
      .eq('published', true)
      .maybeSingle();

    if (eventError || !eventRow) {
      return NextResponse.json({ success: false, error: 'Event not found.' }, { status: 404 });
    }

    const ticketPriceResult = audAmountToCents(eventRow.ticket_price || 0);
    if (!ticketPriceResult.ok) {
      return NextResponse.json({ success: false, error: 'Event pricing is unavailable.' }, { status: 503 });
    }
    const ticketPriceCents = ticketPriceResult.value;
    const totalCents = ticketPriceCents * qty;
    if (!Number.isSafeInteger(totalCents) || totalCents > PUBLIC_ORDER_LIMITS.maximumOrderCents) {
      return NextResponse.json({ success: false, error: 'Event registration total exceeds the allowed limit.' }, { status: 400 });
    }
    const ticketPrice = ticketPriceCents / 100;
    const isPaid = ticketPriceCents > 0;
    const totalCost = totalCents / 100;
    const paymentReference = isPaid ? await generateUniquePaymentReference('event') : null;

    let linkedOrder: { id: string } | null = null;
    if (isPaid && paymentReference) {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_name: sanitiseInput(name),
          customer_email: sanitiseInput(email),
          customer_phone: sanitiseInput(phone),
          items: [
            {
              name: eventRow.title,
              size: 'ticket',
              quantity: qty,
              price: ticketPrice,
            },
          ],
          total_amount: totalCost,
          payment_status: 'pending_bank_transfer',
          payment_reference: paymentReference,
          order_category: 'event',
          order_status: 'submitted',
          processed: false,
          notes: `Event registration: ${eventRow.title}`,
        })
        .select('id')
        .single();

      if (orderError || !order) {
        console.error('Supabase event order insert error:', orderError);
        return NextResponse.json({ success: false, error: 'Failed to prepare event payment.' }, { status: 500 });
      }
      linkedOrder = order;
    }

    const { error: registrationError } = await supabase.from('event_registrations').insert({
      event_id: eventRow.id,
      name: sanitiseInput(name),
      email: sanitiseInput(email),
      phone: sanitiseInput(phone),
      quantity: qty,
      payment_status: isPaid ? 'pending_bank_transfer' : 'not_required',
      payment_reference: paymentReference,
      order_id: linkedOrder?.id ?? null,
    });

    if (registrationError) {
      if (linkedOrder) {
        await supabase.from('orders').delete().eq('id', linkedOrder.id);
      }
      console.error('Supabase event registration insert error:', registrationError);
      return NextResponse.json(
        { success: false, error: 'Failed to register for event.' },
        { status: 500 }
      );
    }

    if (!isPaid) await sendEmail({
      to: sanitiseInput(email),
      subject: `Event registration confirmed - ${eventRow.title} | NDCC Dinos`,
      html: emailHtml(
        'Registration Confirmed',
        `<p style="font-size:15px;color:#374151;line-height:1.6;">Hi ${escapeEmailHtml(sanitiseInput(name))},</p>
        <p style="font-size:15px;color:#374151;line-height:1.6;">You are registered for <strong>${escapeEmailHtml(eventRow.title)}</strong>${eventRow.event_date ? ` on ${new Date(eventRow.event_date).toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}.</p>
        ${eventRow.location ? `<p style="font-size:14px;color:#374151;"><strong>Location:</strong> ${escapeEmailHtml(eventRow.location)}</p>` : ''}
        <p style="font-size:14px;color:#374151;"><strong>Tickets:</strong> ${qty}</p>
        ${isPaid && paymentReference
          ? bankDetailsHtml(paymentReference, totalCost)
          : `<div style="background:#f0fdf4;border-radius:6px;padding:16px;margin:16px 0;"><p style="margin:0;font-size:14px;color:#166534;font-weight:bold;">Free entry - no payment required.</p></div>`
        }
        <p style="font-size:13px;color:#6b7280;">Questions? Contact us at <a href="mailto:ndcc.secretary1@gmail.com" style="color:#800000;">ndcc.secretary1@gmail.com</a>.</p>`
      ),
    });

    return NextResponse.json({
      success: true,
      message: 'Registration confirmed!',
      order_id: linkedOrder?.id ?? null,
      total_amount: totalCost,
      payment_reference: paymentReference,
      bank_details: isPaid
        ? {
            account_name: process.env.NDCC_BANK_ACCOUNT_NAME || '',
            bsb: process.env.NDCC_BANK_BSB || '',
            account_number: process.env.NDCC_BANK_ACCOUNT_NUMBER || '',
          }
        : null,
    });
  } catch (err) {
    console.error('Event registration route error:', err);
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}

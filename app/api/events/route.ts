import { configuredBankDetails } from '@/lib/payments/bank-transfer';
import { createServerClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { enforceHoneypotAndTiming, enforceRateLimit, getClientIp } from '@/lib/server/request-guards';
import { formatDateTime, validateEmail, validatePhone, sanitiseInput } from '@/lib/utils';
import { generateUniquePaymentReference } from '@/lib/payments/reference';
import { sendEmail, emailHtml, bankDetailsHtml, escapeEmailHtml } from '@/lib/email';
import {
  PUBLIC_ORDER_LIMITS,
  audAmountToCents,
  readLimitedJsonObject,
} from '@/lib/order-input-validation';
import { isUuidV1ToV5 } from '@/lib/validation/uuid';
import { isSongRequestEvent, normaliseSongRequests, songLabel, type SongRequest } from '@/lib/events/song-requests';
import { getNotificationRecipients } from '@/lib/notification-recipients';

export const dynamic = 'force-dynamic';


// Registrations in these payment states no longer hold a place.
const RELEASED_REGISTRATION_STATUSES = new Set(['cancelled', 'failed', 'refunded', 'expired']);
const EVENT_CLOSED_MESSAGE = 'Registrations for this event have closed.';
const EVENT_FULL_MESSAGE = 'There are not enough places left for this event. Please reduce the number of tickets or contact the club.';

type SupabaseErrorLike = { code?: string; message?: string } | null | undefined;

function isMissingRegistrationRpc(error: SupabaseErrorLike) {
  const message = error?.message || '';
  return error?.code === 'PGRST202' || error?.code === '42883' || message.includes('Could not find the function');
}

function registrationRpcRefusal(error: SupabaseErrorLike): string | null {
  const message = error?.message || '';
  if (message.includes('Event registration capacity reached')) return EVENT_FULL_MESSAGE;
  if (message.includes('Event registration closed') || message.includes('Event registration unavailable')) return EVENT_CLOSED_MESSAGE;
  return null;
}

function eventHasStarted(date: unknown, now = Date.now()) {
  const startsAt = typeof date === 'string' ? Date.parse(date) : Number.NaN;
  return !Number.isFinite(startsAt) || startsAt <= now;
}

export async function POST(request: Request) {
  try {
    const parsedBody = await readLimitedJsonObject(request, PUBLIC_ORDER_LIMITS.bodyBytes);
    if (!parsedBody.ok) {
      return NextResponse.json(
        { success: false, error: parsedBody.error },
        { status: parsedBody.error === 'Request body is too large.' ? 413 : 400 },
      );
    }
    const body = parsedBody.value;

    const { event_id, name, email, phone, quantity, hp_field, submitted_at, songs } = body;
    // Song-request events send named songs instead of a ticket quantity.
    const hasSongs = songs !== undefined;

    if (typeof event_id !== 'string' || !isUuidV1ToV5(event_id)
      || typeof name !== 'string' || !name.trim() || name.trim().length > PUBLIC_ORDER_LIMITS.nameLength
      || typeof email !== 'string' || !email.trim() || email.trim().length > PUBLIC_ORDER_LIMITS.emailLength
      || typeof phone !== 'string' || !phone.trim() || phone.trim().length > PUBLIC_ORDER_LIMITS.phoneLength
      || (!hasSongs && (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20))
      || typeof hp_field !== 'string' || hp_field.length > 200
      || typeof submitted_at !== 'number' || !Number.isFinite(submitted_at) || submitted_at <= 0) {
      return NextResponse.json(
        { success: false, error: 'One or more event registration details are invalid.' },
        { status: 400 },
      );
    }

    const ip = getClientIp(request);
    if (!await enforceRateLimit(`event:${ip}`, 8, 60_000)) {
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

    const qty = hasSongs ? 1 : quantity as number;

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { success: false, error: 'Service not configured.' },
        { status: 503 }
      );
    }

    const supabase = createServerClient();
    const safeEventId = sanitiseInput(event_id);

    const lookupEvent = (columns: string) => supabase
      .from('events')
      .select(columns)
      .eq('id', safeEventId)
      .eq('published', true)
      .maybeSingle();
    // Scheduled events (published_at in the future) are not open yet. Retry
    // without the column where the scheduling migration is not applied.
    let lookup = await lookupEvent('id,title,date,ticket_price,location,capacity,published_at,registration_mode');
    if (lookup.error && /registration_mode/.test(lookup.error.message || '')) {
      lookup = await lookupEvent('id,title,date,ticket_price,location,capacity,published_at');
    }
    if (lookup.error && /published_at/.test(lookup.error.message || '')) {
      lookup = await lookupEvent('id,title,date,ticket_price,location,capacity');
    }
    const eventError = lookup.error;
    const scheduledRow = lookup.data as unknown as { published_at?: string | null } | null;
    const eventRow = scheduledRow && scheduledRow.published_at && Date.parse(scheduledRow.published_at) > Date.now()
      ? null
      : lookup.data as unknown as { id: string; title: string; date: string | null; ticket_price: number | null; location: string | null; capacity: number | null; registration_mode?: string | null } | null;

    if (eventError) {
      console.error('Supabase event lookup error:', eventError);
      return NextResponse.json({ success: false, error: 'Event registration is temporarily unavailable.' }, { status: 503 });
    }
    if (!eventRow) {
      return NextResponse.json({ success: false, error: 'Event not found.' }, { status: 404 });
    }

    if (eventHasStarted(eventRow.date)) {
      return NextResponse.json({ success: false, error: EVENT_CLOSED_MESSAGE }, { status: 409 });
    }
    const songEvent = isSongRequestEvent(eventRow);
    if (songEvent !== hasSongs) {
      return NextResponse.json(
        { success: false, error: songEvent ? 'Add at least one song to enter.' : 'One or more event registration details are invalid.' },
        { status: 400 },
      );
    }
    let songRequests: SongRequest[] = [];
    if (songEvent) {
      const parsedSongs = normaliseSongRequests(songs);
      if (!parsedSongs.ok) return NextResponse.json({ success: false, error: parsedSongs.error }, { status: 400 });
      songRequests = parsedSongs.value.map(song => ({ title: sanitiseInput(song.title), artist: sanitiseInput(song.artist) }));
    }
    const capacity = eventRow.capacity;
    if (capacity !== null && capacity !== undefined) {
      // Early application-level check. The ndcc_register_event_attendee RPC
      // below repeats it atomically under a row lock when it is deployed.
      const { data: existing, error: existingError } = await supabase
        .from('event_registrations')
        .select('quantity,payment_status')
        .eq('event_id', eventRow.id);
      if (existingError || !Array.isArray(existing)) {
        console.error('Supabase event capacity lookup error:', existingError);
        return NextResponse.json({ success: false, error: 'Event registration is temporarily unavailable.' }, { status: 503 });
      }
      const taken = existing.reduce((sum: number, registration: { quantity?: number | null; payment_status?: string | null }) => (
        RELEASED_REGISTRATION_STATUSES.has(String(registration.payment_status || '')) ? sum : sum + (Number(registration.quantity) || 1)
      ), 0);
      if (typeof capacity !== 'number' || taken + qty > capacity) {
        return NextResponse.json({ success: false, error: EVENT_FULL_MESSAGE }, { status: 409 });
      }
    }

    const ticketPriceResult = audAmountToCents(eventRow.ticket_price || 0);
    if (!ticketPriceResult.ok) {
      return NextResponse.json({ success: false, error: 'Event pricing is unavailable.' }, { status: 503 });
    }
    const ticketPriceCents = ticketPriceResult.value;
    const unitCount = songEvent ? songRequests.length : qty;
    const totalCents = ticketPriceCents * unitCount;
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
          items: songEvent
            // event_id keys the admin purchase group (lib/orders/purchase-groups.ts)
            // so the order stays with its event if the event is renamed; the
            // name is the title at purchase time and the fallback key.
            ? songRequests.map((song) => ({
              name: eventRow.title,
              event_id: eventRow.id,
              size: `Song: ${songLabel(song)}`,
              quantity: 1,
              price: ticketPrice,
            }))
            : [
              {
                name: eventRow.title,
                event_id: eventRow.id,
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
          notes: songEvent
            ? `Event registration: ${eventRow.title} (${songRequests.length} ${songRequests.length === 1 ? 'song' : 'songs'})`
            : `Event registration: ${eventRow.title}`,
        })
        .select('id')
        .single();

      if (orderError || !order) {
        console.error('Supabase event order insert error:', orderError);
        return NextResponse.json({ success: false, error: 'Failed to prepare event payment.' }, { status: 500 });
      }
      linkedOrder = order;
    }

    const registration = {
      event_id: eventRow.id,
      name: sanitiseInput(name),
      email: sanitiseInput(email),
      phone: sanitiseInput(phone),
      quantity: qty,
      payment_status: isPaid ? 'pending_bank_transfer' : 'not_required',
      payment_reference: paymentReference,
      order_id: linkedOrder?.id ?? null,
    };
    // Prefer the atomic, capacity-locked RPC; fall back to the plain insert
    // (already guarded by the application-level check above) when the
    // migration has not been applied yet.
    let { error: registrationError } = songEvent
      ? await supabase.rpc('ndcc_register_event_song_entry', {
        p_event_id: registration.event_id,
        p_name: registration.name,
        p_email: registration.email,
        p_phone: registration.phone,
        p_payment_status: registration.payment_status,
        p_payment_reference: registration.payment_reference,
        p_order_id: registration.order_id,
        p_song_requests: songRequests,
      })
      : await supabase.rpc('ndcc_register_event_attendee', {
      p_event_id: registration.event_id,
      p_name: registration.name,
      p_email: registration.email,
      p_phone: registration.phone,
      p_quantity: registration.quantity,
      p_payment_status: registration.payment_status,
      p_payment_reference: registration.payment_reference,
      p_order_id: registration.order_id,
    });
    if (registrationError && !songEvent && isMissingRegistrationRpc(registrationError)) {
      ({ error: registrationError } = await supabase.from('event_registrations').insert(registration));
    }

    if (registrationError) {
      if (linkedOrder) {
        await supabase.from('orders').delete().eq('id', linkedOrder.id);
      }
      const refusal = registrationRpcRefusal(registrationError);
      if (refusal) {
        return NextResponse.json({ success: false, error: refusal }, { status: 409 });
      }
      console.error('Supabase event registration insert error:', registrationError);
      return NextResponse.json(
        { success: false, error: 'Failed to register for event.' },
        { status: 500 }
      );
    }

    // Staff copy of every song entry (CMS: Song request entries; secretary by default).
    // A notification failure never fails the entrant's registration.
    if (songEvent) {
      try {
        const staff = await getNotificationRecipients('event_song_requests');
        if (staff.length > 0) {
          const row = (label: string, value: string) => `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;width:140px;">${label}</td><td style="padding:6px 0;font-size:14px;">${value}</td></tr>`;
          await sendEmail({
            to: staff,
            replyTo: sanitiseInput(email),
            subject: `Song entry - ${eventRow.title}: ${sanitiseInput(name)} (${songRequests.length} ${songRequests.length === 1 ? 'song' : 'songs'}) | NDCC Dinos`,
            tags: [{ name: 'category', value: 'event-song-entry' }],
            html: emailHtml(
              'New song entry',
              `<p style="font-size:15px;color:#374151;line-height:1.6;">A new song entry was submitted for <strong>${escapeEmailHtml(eventRow.title)}</strong>${eventRow.date ? ` on ${formatDateTime(eventRow.date)}` : ''}.</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                ${row('Name', escapeEmailHtml(sanitiseInput(name)))}
                ${row('Email', escapeEmailHtml(sanitiseInput(email)))}
                ${row('Phone', escapeEmailHtml(sanitiseInput(phone)))}
                ${row('Songs', String(songRequests.length))}
                ${row('Total', `$${totalCost.toFixed(2)}`)}
                ${paymentReference ? row('Payment reference', escapeEmailHtml(paymentReference)) : ''}
                ${row('Payment', isPaid ? 'Awaiting payment (card or bank transfer). Check Admin &gt; Orders before counting these songs.' : 'No payment required')}
              </table>
              <p style="font-size:14px;color:#374151;font-weight:bold;margin:16px 0 4px;">Song list</p>
              <ol style="font-size:14px;color:#374151;line-height:1.6;">${songRequests.map((song) => `<li>${escapeEmailHtml(songLabel(song))}</li>`).join('')}</ol>`
            ),
          });
        }
      } catch (notifyError) {
        console.error('Song entry staff notification failed:', notifyError);
      }
    }

    if (!isPaid) await sendEmail({
      to: sanitiseInput(email),
      subject: `Event registration confirmed - ${eventRow.title} | NDCC Dinos`,
      html: emailHtml(
        'Registration Confirmed',
        `<p style="font-size:15px;color:#374151;line-height:1.6;">Hi ${escapeEmailHtml(sanitiseInput(name))},</p>
        <p style="font-size:15px;color:#374151;line-height:1.6;">You are registered for <strong>${escapeEmailHtml(eventRow.title)}</strong>${eventRow.date ? ` on ${formatDateTime(eventRow.date)}` : ''}.</p>
        ${eventRow.location ? `<p style="font-size:14px;color:#374151;"><strong>Location:</strong> ${escapeEmailHtml(eventRow.location)}</p>` : ''}
        ${songEvent
          ? `<p style="font-size:14px;color:#374151;"><strong>Songs:</strong></p><ol style="font-size:14px;color:#374151;">${songRequests.map((song) => `<li>${escapeEmailHtml(songLabel(song))}</li>`).join('')}</ol>`
          : `<p style="font-size:14px;color:#374151;"><strong>Tickets:</strong> ${qty}</p>`}
        ${isPaid && paymentReference
          ? bankDetailsHtml(paymentReference, totalCost)
          : `<div style="background:#f0fdf4;border-radius:6px;padding:16px;margin:16px 0;"><p style="margin:0;font-size:14px;color:#166534;font-weight:bold;">Free entry - no payment required.</p></div>`
        }
        <p style="font-size:13px;color:#6b7280;">Questions? Contact us at <a href="mailto:ndcc.secretary1@gmail.com" style="color:#880000;">ndcc.secretary1@gmail.com</a>.</p>`
      ),
    });

    return NextResponse.json({
      success: true,
      message: 'Registration confirmed!',
      order_id: linkedOrder?.id ?? null,
      total_amount: totalCost,
      payment_reference: paymentReference,
      bank_details: isPaid ? configuredBankDetails() : null,
    });
  } catch (err) {
    console.error('Event registration route error:', err);
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}

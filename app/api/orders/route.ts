import { createServerClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { enforceHoneypotAndTiming, enforceRateLimit, getClientIp } from '@/lib/server/request-guards';
import { generateUniquePaymentReference } from '@/lib/payments/reference';
import { validateEmail, validatePhone } from '@/lib/utils';
import { sendEmail, emailHtml, bankDetailsHtml } from '@/lib/email';
import { loadPricedCatalogue, priceOrderItems, type PostedOrderItem as PostedItem } from '@/lib/apparel/server-catalogue';

export const dynamic = 'force-dynamic';

function sanitiseInput(str: string): string {
  return str.replace(/<[^>]*>/g, '').trim();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { customer_name, customer_email, customer_phone, items, total_amount, notes, hp_field, submitted_at, order_category, merch_window_id } = body;

    const ip = getClientIp(request);
    if (!enforceRateLimit(`order:${ip}`, 6, 60_000)) {
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

    if (!validateEmail(customer_email)) {
      return NextResponse.json(
        { success: false, error: 'Please provide a valid email address.' },
        { status: 400 }
      );
    }

    if (!customer_phone || !validatePhone(customer_phone)) {
      return NextResponse.json(
        { success: false, error: 'Please provide a valid phone number.' },
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

    let orderStatus = 'submitted';
    let merchWindowLabel: string | null = null;
    let safeMerchWindowId: string | null = null;

    if (order_category === 'merch') {
      const { data: windowRow, error: windowError } = merch_window_id
        ? await supabase.from('merch_order_windows').select('*').eq('id', merch_window_id).eq('active', true).maybeSingle()
        : await supabase
            .from('merch_order_windows')
            .select('*')
            .eq('active', true)
            .order('open_date', { ascending: true })
            .limit(1)
            .maybeSingle();

      if (windowError) {
        return NextResponse.json({ success: false, error: 'Unable to validate merch window.' }, { status: 500 });
      }
      if (!windowRow) {
        return NextResponse.json({ success: false, error: 'No valid merch window is configured.' }, { status: 409 });
      }
      if (merch_window_id && !windowRow.id) {
        return NextResponse.json({ success: false, error: 'Invalid merch window.' }, { status: 409 });
      }

      safeMerchWindowId = windowRow.id;
      merchWindowLabel = windowRow.label;
      const now = new Date();
      const isOpen = new Date(windowRow.open_date) <= now && new Date(windowRow.close_date) >= now;
      if (!isOpen) {
        if (!windowRow.allow_queue_after_close) {
          return NextResponse.json({ success: false, error: 'Merch window is closed and queueing is disabled.' }, { status: 409 });
        }
        orderStatus = 'queued_next_window';
      }
    }

    // Never trust client prices or totals: resolve every posted item against
    // the live catalogue (base price + selected option surcharges) and
    // recompute everything server-side. Unknown products, invalid options or
    // an unreachable catalogue reject the order — since the live catalogue
    // page shows an explicit unavailable state, an order that references
    // products the server cannot verify is never accepted at face value.
    const catalogue = await loadPricedCatalogue(supabase);
    if (!catalogue.ok) {
      console.error('Orders catalogue lookup failed:', catalogue.error);
      return NextResponse.json(
        { success: false, error: 'Unable to verify product pricing. Please try again shortly.' },
        { status: 503 }
      );
    }

    const priced = priceOrderItems(catalogue.products, items as PostedItem[], { maxQuantity: 999 });
    if (!priced.ok) {
      return NextResponse.json({ success: false, error: priced.error }, { status: 400 });
    }

    const normalisedItems = priced.items;
    const serverTotal = priced.totalAmount;
    const needsReviewReason = priced.clientPriceMismatches.length > 0
      ? `client price mismatch (server prices used): ${priced.clientPriceMismatches.join('; ')}`.slice(0, 500)
      : null;

    const paymentReference = await generateUniquePaymentReference();

    const { data, error } = await supabase
      .from('orders')
      .insert({
        customer_name: sanitiseInput(customer_name),
        customer_email: sanitiseInput(customer_email),
        customer_phone: customer_phone ? sanitiseInput(customer_phone) : '',
        items: normalisedItems,
        total_amount: serverTotal,
        ...(needsReviewReason ? { needs_review_reason: needsReviewReason } : {}),
        payment_status: 'pending_bank_transfer',
        order_category: order_category === 'merch' ? 'merch' : 'general',
        order_status: orderStatus,
        merch_window_id: safeMerchWindowId,
        merch_window_label: merchWindowLabel,
        payment_reference: paymentReference,
        processed: false,
        notes: notes ? sanitiseInput(notes) : '',
      })
      .select('id')
      .single();

    if (error) {
      console.error('Supabase order insert error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to submit order.' },
        { status: 500 }
      );
    }

    const personalisationRequested = normalisedItems.some(
      (i) => Boolean(i.custom_name) || i.number_request_status === 'subject_to_availability'
    );
    const numberRequested = normalisedItems.some((i) => i.number_request_status === 'subject_to_availability');
    const itemListHtml = normalisedItems
      .map((i) => {
        const preferences = [i.custom_number, i.alternate_number]
          .filter((number): number is number => typeof number === 'number')
          .join(', ');
        const selectedOptionLines = (i.applied_options || [])
          .map((option) => `${escapeHtml(option.group)}: ${escapeHtml(option.label)}`);
        const itemDetailLines = [
          ...selectedOptionLines,
          i.custom_name ? `Surname: ${escapeHtml(i.custom_name)}` : '',
          preferences ? `Number preferences: ${escapeHtml(preferences)} (subject to availability)` : '',
        ].filter(Boolean).join('<br>');
        return (
        `<tr>
          <td style="padding:6px 8px;font-size:14px;border-bottom:1px solid #f3f4f6;">${escapeHtml(String(i.name || 'Item'))}${i.size && i.size !== 'kitchen' ? ` (${escapeHtml(String(i.size))})` : ''}${itemDetailLines ? `<br><span style="font-size:12px;color:#6b7280;">${itemDetailLines}</span>` : ''}</td>
          <td style="padding:6px 8px;font-size:14px;border-bottom:1px solid #f3f4f6;text-align:center;">${i.quantity ?? 1}</td>
          <td style="padding:6px 8px;font-size:14px;border-bottom:1px solid #f3f4f6;text-align:right;">$${((i.price ?? 0) * (i.quantity ?? 1)).toFixed(2)}</td>
        </tr>`
        );
      })
      .join('');
    void sendEmail({
      to: sanitiseInput(customer_email),
      subject: `Order confirmed — Ref ${paymentReference} | NDCC Dinos`,
      html: emailHtml(
        'Order Confirmation',
        `<p style="font-size:15px;color:#374151;line-height:1.6;">Hi ${escapeHtml(sanitiseInput(customer_name))},</p>
        <p style="font-size:15px;color:#374151;line-height:1.6;">Your order has been received. Please complete payment using the bank transfer details below.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:8px;font-size:13px;text-align:left;color:#6b7280;">Item</th>
              <th style="padding:8px;font-size:13px;text-align:center;color:#6b7280;">Qty</th>
              <th style="padding:8px;font-size:13px;text-align:right;color:#6b7280;">Price</th>
            </tr>
          </thead>
          <tbody>${itemListHtml}</tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="padding:10px 8px;font-size:14px;font-weight:bold;text-align:right;">Total</td>
              <td style="padding:10px 8px;font-size:15px;font-weight:bold;text-align:right;color:#800000;">$${serverTotal.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
        ${numberRequested
          ? `<div style="margin:16px 0;padding:12px;border:1px solid #f59e0b;background:#fffbeb;color:#78350f;border-radius:8px;font-size:14px;line-height:1.5;"><strong>Personalisation request:</strong> Surnames and number preferences are subject to club review. Number preferences are subject to availability, and the club will confirm the final number separately by email.</div>`
          : personalisationRequested
            ? `<div style="margin:16px 0;padding:12px;border:1px solid #f59e0b;background:#fffbeb;color:#78350f;border-radius:8px;font-size:14px;line-height:1.5;"><strong>Personalisation request:</strong> The surname entered has been recorded for club review.</div>`
            : ''}
        ${bankDetailsHtml(paymentReference, serverTotal)}
        <p style="font-size:13px;color:#6b7280;">Questions? Reply to this email or contact us at <a href="mailto:ndcc.secretary1@gmail.com" style="color:#800000;">ndcc.secretary1@gmail.com</a>.</p>`
      ),
    });
    return NextResponse.json({
      success: true,
      message: 'Order submitted successfully!',
      order_id: data.id,
      total_amount: serverTotal,
      payment_reference: paymentReference,
      order_status: orderStatus,
      merch_window_label: merchWindowLabel,
      personalisation_requested: personalisationRequested,
      number_requested: numberRequested,
      bank_details: {
        account_name: process.env.NDCC_BANK_ACCOUNT_NAME || '',
        bsb: process.env.NDCC_BANK_BSB || '',
        account_number: process.env.NDCC_BANK_ACCOUNT_NUMBER || '',
      },
    });
  } catch (err) {
    console.error('Order route error:', err);
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}

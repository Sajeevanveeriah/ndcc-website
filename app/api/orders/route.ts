import { createServerClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { enforceHoneypotAndTiming, enforceRateLimit, getClientIp } from '@/lib/server/request-guards';
import { generateUniquePaymentReference } from '@/lib/payments/reference';
import { validateEmail, validatePhone } from '@/lib/utils';
import { sendEmail, emailHtml, bankDetailsHtml } from '@/lib/email';

function sanitiseInput(str: string): string {
  return str.replace(/<[^>]*>/g, '').trim();
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

    const paymentReference = await generateUniquePaymentReference();

    const { data, error } = await supabase
      .from('orders')
      .insert({
        customer_name: sanitiseInput(customer_name),
        customer_email: sanitiseInput(customer_email),
        customer_phone: customer_phone ? sanitiseInput(customer_phone) : '',
        items,
        total_amount,
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

    const itemListHtml = (Array.isArray(items) ? items : [])
      .map((i: { name?: string; quantity?: number; price?: number; size?: string }) =>
        `<tr>
          <td style="padding:6px 8px;font-size:14px;border-bottom:1px solid #f3f4f6;">${i.name || 'Item'}${i.size && i.size !== 'kitchen' ? ` (${i.size})` : ''}</td>
          <td style="padding:6px 8px;font-size:14px;border-bottom:1px solid #f3f4f6;text-align:center;">${i.quantity ?? 1}</td>
          <td style="padding:6px 8px;font-size:14px;border-bottom:1px solid #f3f4f6;text-align:right;">$${((i.price ?? 0) * (i.quantity ?? 1)).toFixed(2)}</td>
        </tr>`
      )
      .join('');
    void sendEmail({
      to: sanitiseInput(customer_email),
      subject: `Order confirmed — Ref ${paymentReference} | NDCC Dinos`,
      html: emailHtml(
        'Order Confirmation',
        `<p style="font-size:15px;color:#374151;line-height:1.6;">Hi ${sanitiseInput(customer_name)},</p>
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
              <td style="padding:10px 8px;font-size:15px;font-weight:bold;text-align:right;color:#800000;">$${Number(total_amount).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
        ${bankDetailsHtml(paymentReference, Number(total_amount))}
        <p style="font-size:13px;color:#6b7280;">Questions? Reply to this email or contact us at <a href="mailto:ndcc.secretary1@gmail.com" style="color:#800000;">ndcc.secretary1@gmail.com</a>.</p>`
      ),
    });
    return NextResponse.json({
      success: true,
      message: 'Order submitted successfully!',
      order_id: data.id,
      payment_reference: paymentReference,
      order_status: orderStatus,
      merch_window_label: merchWindowLabel,
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

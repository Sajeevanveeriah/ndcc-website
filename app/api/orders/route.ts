import { createServerClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { enforceHoneypotAndTiming, enforceRateLimit, getClientIp } from '@/lib/server/request-guards';
import { generateUniquePaymentReference } from '@/lib/payments/reference';
import { validateEmail, validatePhone } from '@/lib/utils';
import { sendEmail, emailHtml, bankDetailsHtml } from '@/lib/email';

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

type PostedItem = {
  slug?: string;
  name?: string;
  size?: string;
  quantity?: number;
  price?: number;
  custom_name?: string;
  custom_number?: number;
};

type CatalogueRow = { slug: string; name: string; price: number };

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

    // Recompute per-item prices against the live catalogue (by slug, falling
    // back to exact name). Unknown items are NOT rejected — the static
    // fallback list may be in use when the products API is down — but any
    // unknown item or price disagreement flags the order for manual review
    // and the order is stored with the server-computed total.
    const priceIssues: string[] = [];
    let catalogueRows: CatalogueRow[] | null = null;
    const { data: catalogue, error: catalogueError } = await supabase
      .from('apparel_products')
      .select('slug,name,price');
    if (catalogueError || !catalogue) {
      console.error('Orders catalogue lookup failed:', catalogueError);
      priceIssues.push('product catalogue lookup failed; client prices unverified');
    } else {
      catalogueRows = catalogue as CatalogueRow[];
    }

    let serverTotal = 0;
    const normalisedItems = (items as PostedItem[]).map((rawItem) => {
      const itemLabel = String(rawItem.name || rawItem.slug || 'unnamed item');
      const rawQuantity = Math.floor(Number(rawItem.quantity));
      const quantity = Number.isFinite(rawQuantity) && rawQuantity > 0 ? Math.min(rawQuantity, 999) : 1;
      const clientPrice = Number(rawItem.price);
      const safeClientPrice = Number.isFinite(clientPrice) && clientPrice >= 0 ? clientPrice : 0;

      let effectivePrice = safeClientPrice;
      if (catalogueRows) {
        const bySlug = rawItem.slug ? catalogueRows.find((p) => p.slug === rawItem.slug) : undefined;
        const match = bySlug || catalogueRows.find((p) => p.name === rawItem.name);
        if (!match) {
          priceIssues.push(`unknown item "${itemLabel}" kept at client price $${safeClientPrice.toFixed(2)}`);
        } else {
          const serverPrice = Number(match.price);
          if (Math.abs(serverPrice - safeClientPrice) > 0.005) {
            priceIssues.push(`price mismatch for "${match.name}": client $${safeClientPrice.toFixed(2)}, server $${serverPrice.toFixed(2)}`);
          }
          effectivePrice = serverPrice;
        }
      }

      serverTotal += effectivePrice * quantity;
      return { ...rawItem, quantity, price: effectivePrice };
    });
    serverTotal = Math.round(serverTotal * 100) / 100;

    if (serverTotal <= 0) {
      return NextResponse.json(
        { success: false, error: 'Order total must be greater than zero.' },
        { status: 400 }
      );
    }

    const needsReviewReason = priceIssues.length > 0
      ? `unverified prices: ${priceIssues.join('; ')}`.slice(0, 500)
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

    const itemListHtml = normalisedItems
      .map((i) =>
        `<tr>
          <td style="padding:6px 8px;font-size:14px;border-bottom:1px solid #f3f4f6;">${escapeHtml(String(i.name || 'Item'))}${i.size && i.size !== 'kitchen' ? ` (${escapeHtml(String(i.size))})` : ''}</td>
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
        ${bankDetailsHtml(paymentReference, serverTotal)}
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

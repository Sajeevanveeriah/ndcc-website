import { configuredBankDetails } from '@/lib/payments/bank-transfer';
import { deriveCapabilities, loadMerchPaymentSettings } from '@/lib/payments/capabilities';
import { createServerClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { enforceHoneypotAndTiming, enforceRateLimit, enforceTurnstile, getClientIp } from '@/lib/server/request-guards';
import { generateUniquePaymentReference } from '@/lib/payments/reference';
import { validateEmail, validatePhone, sanitiseInput } from '@/lib/utils';
import { sendEmail, emailHtml, bankDetailsHtml } from '@/lib/email';
import { escapeEmailHtml } from '@/lib/email-html';
import { getReceiptRecipients, getStaffOrderNotificationRecipients } from '@/lib/notification-recipients';
import { loadPricedCatalogue, priceOrderItems, type PostedOrderItem as PostedItem } from '@/lib/apparel/server-catalogue';
import {
  PUBLIC_ORDER_LIMITS,
  audAmountToCents,
  readLimitedJsonObject,
} from '@/lib/order-input-validation';
import { isUuidV1ToV5 } from '@/lib/validation/uuid';

export const dynamic = 'force-dynamic';

const MERCH_ITEM_LINES_LIMIT = 40;
const MERCH_ITEM_QUANTITY_LIMIT = 50;
const MERCH_ITEM_UNITS_LIMIT = 100;

// One client-generated key per order attempt (crypto.randomUUID), reused for
// retries of the same submission. Requests without a key keep the original
// behaviour so older cached clients still order normally.
const IDEMPOTENCY_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_COLUMNS = ['order_idempotency_key', 'order_idempotency_fingerprint'] as const;
const IDEMPOTENCY_CONFLICT_MESSAGE = 'This order attempt was already used for different details. Please review your order and submit it again.';
const REMOVED_ORDER_MESSAGE = 'This order was removed by the club. Please submit a new order.';

type ReplayableOrder = {
  id: string;
  order_category: string | null;
  customer_email: string | null;
  total_amount: number | string | null;
  payment_reference: string | null;
  order_status: string | null;
  merch_window_label: string | null;
  items: unknown;
  deleted_at: string | null;
  order_idempotency_fingerprint: string | null;
};
const REPLAY_COLUMNS = 'id,order_category,customer_email,total_amount,payment_reference,order_status,merch_window_label,items,deleted_at,order_idempotency_fingerprint';

type PricedItemFlags = { custom_name?: unknown; custom_initials?: unknown; number_request_status?: unknown };
function personalisationFlags(items: PricedItemFlags[]) {
  return {
    personalisation_requested: items.some(
      (i) => Boolean(i.custom_name) || Boolean(i.custom_initials) || i.number_request_status === 'subject_to_availability'
    ),
    number_requested: items.some((i) => i.number_request_status === 'subject_to_availability'),
  };
}

function orderFingerprint(body: Record<string, unknown>) {
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  return createHash('sha256').update(JSON.stringify({
    customer_name: text(body.customer_name),
    customer_email: text(body.customer_email).toLowerCase(),
    customer_phone: text(body.customer_phone),
    notes: text(body.notes),
    items: body.items,
    total_amount: body.total_amount,
    payment_method: body.payment_method,
    merch_window_id: body.merch_window_id || null,
  })).digest('hex');
}

function isMissingIdempotencyColumn(error: { code?: string; message?: string } | null) {
  return Boolean(error) && error?.code !== '23505' && /order_idempotency_(key|fingerprint)/i.test(error?.message || '');
}

/** The original order's confirmation, in the same shape as a fresh order, or a refusal. */
function replayResponse(order: ReplayableOrder, fingerprint: string, customerEmail: string) {
  const sameAttempt = order.order_category === 'merch'
    && order.order_idempotency_fingerprint === fingerprint
    && (order.customer_email || '').trim().toLowerCase() === customerEmail.trim().toLowerCase();
  if (!sameAttempt) {
    return NextResponse.json({ success: false, error: IDEMPOTENCY_CONFLICT_MESSAGE }, { status: 409 });
  }
  if (order.deleted_at) {
    return NextResponse.json({ success: false, error: REMOVED_ORDER_MESSAGE }, { status: 409 });
  }
  return NextResponse.json({
    success: true,
    message: 'Order submitted successfully!',
    order_id: order.id,
    total_amount: Number(order.total_amount),
    payment_reference: order.payment_reference,
    order_status: order.order_status,
    merch_window_label: order.merch_window_label,
    ...personalisationFlags(Array.isArray(order.items) ? order.items as PricedItemFlags[] : []),
    bank_details: configuredBankDetails(),
  }, { headers: { 'Idempotent-Replayed': 'true' } });
}

export async function POST(request: Request) {
  try {
    const parsedBody = await readLimitedJsonObject(request);
    if (!parsedBody.ok) {
      return NextResponse.json(
        { success: false, error: parsedBody.error },
        { status: parsedBody.error === 'Request body is too large.' ? 413 : 400 },
      );
    }
    const body = parsedBody.value;

    const { customer_name, customer_email, customer_phone, items, total_amount, notes, hp_field, submitted_at, order_category, merch_window_id, payment_method, idempotency_key } = body;

    if (order_category !== 'merch') {
      return NextResponse.json(
        { success: false, error: 'This endpoint accepts merchandise orders only.' },
        { status: 400 },
      );
    }
    if (payment_method !== 'stripe' && payment_method !== 'bank_transfer' && payment_method !== 'pay_at_club') {
      return NextResponse.json(
        { success: false, error: 'Choose a valid merchandise payment method.' },
        { status: 400 },
      );
    }
    if (typeof customer_name !== 'string' || !customer_name.trim()
      || customer_name.trim().length > PUBLIC_ORDER_LIMITS.nameLength
      || typeof customer_email !== 'string' || !customer_email.trim()
      || customer_email.trim().length > PUBLIC_ORDER_LIMITS.emailLength
      || typeof customer_phone !== 'string' || !customer_phone.trim()
      || customer_phone.trim().length > PUBLIC_ORDER_LIMITS.phoneLength
      || (notes !== undefined && notes !== null && typeof notes !== 'string')
      || (typeof notes === 'string' && notes.trim().length > PUBLIC_ORDER_LIMITS.notesLength)
      || typeof hp_field !== 'string' || hp_field.length > 200
      || typeof submitted_at !== 'number' || !Number.isFinite(submitted_at) || submitted_at <= 0) {
      return NextResponse.json(
        { success: false, error: 'One or more customer details are invalid or too long.' },
        { status: 400 },
      );
    }
    if (merch_window_id !== undefined && merch_window_id !== null && merch_window_id !== ''
      && (typeof merch_window_id !== 'string' || !isUuidV1ToV5(merch_window_id))) {
      return NextResponse.json(
        { success: false, error: 'A valid merchandise order window is required.' },
        { status: 400 },
      );
    }

    if (idempotency_key !== undefined && idempotency_key !== null
      && (typeof idempotency_key !== 'string' || !IDEMPOTENCY_KEY_PATTERN.test(idempotency_key))) {
      return NextResponse.json(
        { success: false, error: 'A valid order attempt key is required. Refresh the page and try again.' },
        { status: 400 },
      );
    }
    let idempotencyKey = typeof idempotency_key === 'string' ? idempotency_key.toLowerCase() : null;

    const ip = getClientIp(request);
    if (!await enforceRateLimit(`order:${ip}`, 6, 60_000)) {
      return NextResponse.json(
        { success: false, error: 'Too many checkout attempts. Please wait and try again.' },
        { status: 429 }
      );
    }

    if (!enforceHoneypotAndTiming(hp_field, submitted_at)) {
      return NextResponse.json({ success: false, error: 'Invalid form submission.' }, { status: 400 });
    }
    // Optional Cloudflare Turnstile check; a no-op unless TURNSTILE_SECRET_KEY is set.
    if (!await enforceTurnstile(request, body)) {
      return NextResponse.json({ success: false, error: 'Please complete the security check and try again.' }, { status: 403 });
    }

    if (!items || total_amount === undefined || total_amount === null) {
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

    if (!Array.isArray(items) || items.length === 0 || items.length > MERCH_ITEM_LINES_LIMIT) {
      return NextResponse.json(
        { success: false, error: `Order must contain between 1 and ${MERCH_ITEM_LINES_LIMIT} item lines.` },
        { status: 400 }
      );
    }

    let totalUnits = 0;
    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return NextResponse.json({ success: false, error: 'One or more merchandise items are invalid.' }, { status: 400 });
      }
      const quantity = (item as Record<string, unknown>).quantity;
      if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity)
        || quantity < 1 || quantity > MERCH_ITEM_QUANTITY_LIMIT) {
        return NextResponse.json({ success: false, error: 'Merchandise quantities are invalid.' }, { status: 400 });
      }
      totalUnits += quantity;
      if (totalUnits > MERCH_ITEM_UNITS_LIMIT) {
        return NextResponse.json({ success: false, error: 'Too many merchandise units were selected.' }, { status: 400 });
      }
    }

    const postedTotal = audAmountToCents(total_amount, { allowZero: false });
    if (!postedTotal.ok) {
      return NextResponse.json(
        { success: false, error: 'Total amount must be a valid, bounded AUD amount.' },
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

    // A retry of an attempt that already created an order returns that order's
    // confirmation without inserting again or re-sending emails.
    const fingerprint = idempotencyKey ? orderFingerprint(body) : null;
    const findAttempt = (key: string) => supabase.from('orders').select(REPLAY_COLUMNS)
      .eq('order_idempotency_key', key).maybeSingle<ReplayableOrder>();
    if (idempotencyKey && fingerprint) {
      const existing = await findAttempt(idempotencyKey);
      if (existing.error) {
        if (!isMissingIdempotencyColumn(existing.error)) {
          console.error('Order attempt lookup error:', existing.error);
          return NextResponse.json(
            { success: false, error: 'Unable to submit order. Please try again shortly.' },
            { status: 503 },
          );
        }
        // Before the idempotency migration: behave exactly as without a key.
        idempotencyKey = null;
      } else if (existing.data) {
        return replayResponse(existing.data, fingerprint, customer_email);
      }
    }

    let orderStatus = 'submitted';
    let merchWindowLabel: string | null = null;
    let safeMerchWindowId: string | null = null;

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

    // Never trust client prices or totals: resolve every posted item against
    // the live catalogue (base price + selected option surcharges) and
    // recompute everything server-side. Unknown products, invalid options or
    // an unreachable catalogue reject the order because the live catalogue
    // page shows an explicit unavailable state.
    const catalogue = await loadPricedCatalogue(supabase);
    if (!catalogue.ok) {
      console.error('Orders catalogue lookup failed:', catalogue.error);
      return NextResponse.json(
        { success: false, error: 'Unable to verify product pricing. Please try again shortly.' },
        { status: 503 }
      );
    }

    const priced = priceOrderItems(catalogue.products, items as PostedItem[], {
      maxQuantity: MERCH_ITEM_QUANTITY_LIMIT,
    });
    if (!priced.ok) {
      return NextResponse.json({ success: false, error: priced.error }, { status: 400 });
    }

    const normalisedItems = priced.items;
    const serverTotal = priced.totalAmount;
    const serverTotalCents = audAmountToCents(serverTotal, { allowZero: false });
    if (!serverTotalCents.ok) {
      return NextResponse.json(
        { success: false, error: 'Merchandise order total exceeds the allowed limit.' },
        { status: 400 },
      );
    }
    const totalMismatch = postedTotal.value !== serverTotalCents.value
      ? `cart total: client $${(postedTotal.value / 100).toFixed(2)}, server $${serverTotal.toFixed(2)}`
      : null;
    const priceMismatches = [
      ...priced.clientPriceMismatches,
      ...(totalMismatch ? [totalMismatch] : []),
    ];
    const needsReviewReason = priceMismatches.length > 0
      ? `client price mismatch (server prices used): ${priceMismatches.join('; ')}`.slice(0, 500)
      : null;

    const capabilities = deriveCapabilities(await loadMerchPaymentSettings(supabase));
    const methodAvailable = payment_method === 'bank_transfer' ? capabilities.bank_transfer
      : payment_method === 'pay_at_club' ? capabilities.pay_at_club
      : capabilities.card;
    if (!methodAvailable) return NextResponse.json({ error: 'The selected payment method is currently unavailable.' }, { status: 400 });
    const paymentReference = await generateUniquePaymentReference('merch');

    const insertOrder = (row: Record<string, unknown>) => supabase.from('orders').insert(row).select('id').single();
    const orderRow: Record<string, unknown> = {
        customer_name: sanitiseInput(customer_name),
        customer_email: sanitiseInput(customer_email),
        customer_phone: customer_phone ? sanitiseInput(customer_phone) : '',
        items: normalisedItems,
        total_amount: serverTotal,
        ...(needsReviewReason ? { needs_review_reason: needsReviewReason } : {}),
        payment_status: 'pending_bank_transfer',
        bank_transfer_selected_at: payment_method === 'bank_transfer' ? new Date().toISOString() : null,
        // Intent only, like the bank choice: staff record the payment when it is received at the club.
        ...(payment_method === 'pay_at_club' ? { bar_payment_selected_at: new Date().toISOString() } : {}),
        ...(payment_method === 'stripe' ? { payment_method_choice: 'stripe', payment_method_choice_source: 'purchaser' } : {}),
        order_category: 'merch',
        order_status: orderStatus,
        merch_window_id: safeMerchWindowId,
        merch_window_label: merchWindowLabel,
        payment_reference: paymentReference,
        processed: false,
        notes: notes ? sanitiseInput(notes) : '',
        ...(idempotencyKey && fingerprint
          ? { order_idempotency_key: idempotencyKey, order_idempotency_fingerprint: fingerprint }
          : {}),
      };
    let { data, error } = await insertOrder(orderRow);
    // Before the payment method migration the card choice column is absent;
    // the order still saves (the choice is then derived from the intent columns).
    if (error && error.code !== '23505' && /payment_method_choice/i.test(error.message || '')) {
      delete orderRow.payment_method_choice;
      delete orderRow.payment_method_choice_source;
      ({ data, error } = await insertOrder(orderRow));
    }
    // Before the idempotency migration the key columns are absent; save as before.
    if (isMissingIdempotencyColumn(error) && 'order_idempotency_key' in orderRow) {
      for (const column of IDEMPOTENCY_COLUMNS) delete orderRow[column];
      idempotencyKey = null;
      ({ data, error } = await insertOrder(orderRow));
    }

    // A simultaneous request with the same key won the unique index: answer
    // with its order instead of creating a second one.
    if (error?.code === '23505' && idempotencyKey && fingerprint) {
      const winner = await findAttempt(idempotencyKey);
      if (winner.data) return replayResponse(winner.data, fingerprint, customer_email);
      if (winner.error) {
        console.error('Order attempt race lookup error:', winner.error);
        return NextResponse.json(
          { success: false, error: 'Unable to submit order. Please try again shortly.' },
          { status: 503 },
        );
      }
      // Another unique constraint failed: handled below exactly as before.
    }

    if (error || !data) {
      console.error('Supabase order insert error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to submit order.' },
        { status: 500 }
      );
    }

    const {
      personalisation_requested: personalisationRequested,
      number_requested: numberRequested,
    } = personalisationFlags(normalisedItems);
    const itemListHtml = normalisedItems
      .map((i) => {
        const preferences = [i.custom_number, i.alternate_number]
          .filter((number): number is number => typeof number === 'number')
          .join(', ');
        const selectedOptionLines = (i.applied_options || [])
          .map((option) => `${escapeEmailHtml(option.group)}: ${escapeEmailHtml(option.label)}`);
        const itemDetailLines = [
          ...selectedOptionLines,
          i.custom_name ? `Surname: ${escapeEmailHtml(i.custom_name)}` : '',
          i.custom_initials ? `${/^[0-9]+$/.test(i.custom_initials) ? 'Number' : 'Initials'}: ${escapeEmailHtml(i.custom_initials)} (subject to club confirmation)` : '',
          preferences ? `Number preferences: ${escapeEmailHtml(preferences)} (subject to availability)` : '',
        ].filter(Boolean).join('<br>');
        return (
        `<tr>
          <td style="padding:6px 8px;font-size:14px;border-bottom:1px solid #f3f4f6;">${escapeEmailHtml(String(i.name || 'Item'))}${i.size && i.size !== 'kitchen' ? ` (${escapeEmailHtml(String(i.size))})` : ''}${itemDetailLines ? `<br><span style="font-size:12px;color:#6b7280;">${itemDetailLines}</span>` : ''}</td>
          <td style="padding:6px 8px;font-size:14px;border-bottom:1px solid #f3f4f6;text-align:center;">${i.quantity ?? 1}</td>
          <td style="padding:6px 8px;font-size:14px;border-bottom:1px solid #f3f4f6;text-align:right;">$${((i.price ?? 0) * (i.quantity ?? 1)).toFixed(2)}</td>
        </tr>`
        );
      })
      .join('');
    const payAtClub = payment_method === 'pay_at_club';
    if (payment_method === 'bank_transfer' || payAtClub) await sendEmail({
      ...(await getReceiptRecipients(sanitiseInput(customer_email), await getStaffOrderNotificationRecipients('apparel'))),
      subject: `Order confirmed - Ref ${paymentReference} | NDCC Dinos`,
      html: emailHtml(
        'Order Confirmation',
        `<p style="font-size:15px;color:#374151;line-height:1.6;">Hi ${escapeEmailHtml(sanitiseInput(customer_name))},</p>
        <p style="font-size:15px;color:#374151;line-height:1.6;">${payAtClub
          ? 'Your order has been received. You chose to pay at the club: please pay at the bar and quote your order reference. Your order is marked paid once the club records your payment.'
          : 'Your order has been received. Please complete payment using the bank transfer details below.'}</p>
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
              <td style="padding:10px 8px;font-size:15px;font-weight:bold;text-align:right;color:#880000;">$${serverTotal.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
        ${numberRequested
          ? `<div style="margin:16px 0;padding:12px;border:1px solid #f59e0b;background:#fffbeb;color:#78350f;border-radius:8px;font-size:14px;line-height:1.5;"><strong>Personalisation request:</strong> Surnames and number preferences are subject to club review. Number preferences are subject to availability, and the club will confirm the final number separately by email.</div>`
          : personalisationRequested
            ? `<div style="margin:16px 0;padding:12px;border:1px solid #f59e0b;background:#fffbeb;color:#78350f;border-radius:8px;font-size:14px;line-height:1.5;"><strong>Personalisation request:</strong> The personalisation entered (surname, initials or backpack number) has been recorded for club review.</div>`
            : ''}
        ${payAtClub
          ? `<p style="font-size:15px;color:#374151;line-height:1.6;"><strong>Order reference:</strong> ${escapeEmailHtml(paymentReference)}<br><strong>Amount to pay at the club:</strong> $${serverTotal.toFixed(2)}</p>`
          : bankDetailsHtml(paymentReference, serverTotal)}
        <p style="font-size:13px;color:#6b7280;">Questions? Reply to this email or contact us at <a href="mailto:ndcc.secretary1@gmail.com" style="color:#880000;">ndcc.secretary1@gmail.com</a>.</p>`
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
      bank_details: configuredBankDetails(),
    });
  } catch (err) {
    console.error('Order route error:', err);
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}


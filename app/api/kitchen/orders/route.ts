import { isMealCollectionWindow, MEAL_COLLECTION_REQUIRED_MESSAGE, mealCollectionLabel, mealServiceLabel } from '@/lib/meal-collection';
import { getStripe } from '@/lib/stripe';
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getLiveKitchenOrderWindow } from '@/lib/kitchen-ordering-settings';
import { enforceHoneypotAndTiming, enforceRateLimit, getClientIp } from '@/lib/server/request-guards';
import { generateUniquePaymentReference } from '@/lib/payments/reference';
import { validateEmail, validatePhone } from '@/lib/utils';
import { sendEmail, emailHtml, bankDetailsHtml, escapeEmailHtml } from '@/lib/email';
import { receiptRecipients } from '@/lib/payments/receipt-recipients';
import { getStaffOrderRecipients } from '@/lib/order-notification-content';
import {
  PUBLIC_ORDER_LIMITS,
  audAmountToCents,
  readLimitedJsonObject,
  validateKitchenOrderInput,
} from '@/lib/order-input-validation';

export const dynamic = 'force-dynamic';

function sanitiseInput(str: string): string {
  return str.replace(/<[^>]*>/g, '').trim();
}

export async function POST(request: Request) {
  const rawBody = await readLimitedJsonObject(request);
  if (!rawBody.ok) {
    const status = rawBody.error === 'Request body is too large.' ? 413 : 400;
    return NextResponse.json({ success: false, error: rawBody.error }, { status });
  }
  const token = rawBody.value.draft_token;
  if (typeof token !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
    return NextResponse.json({ error: 'A valid meal draft token is required.' }, { status: 400 });
  }
  if (rawBody.value.action === 'resume' || rawBody.value.action === 'edit') {
    return resumeOrEdit(request, token, rawBody.value.action, rawBody.value.revision);
  }
  const orderingWindow = await getLiveKitchenOrderWindow();
  if (!orderingWindow.open) return NextResponse.json({ error: orderingWindow.message, order_window: orderingWindow }, { status: 403 });
  if (!isMealCollectionWindow(rawBody.value.collection_window)) {
    return NextResponse.json({ error: MEAL_COLLECTION_REQUIRED_MESSAGE }, { status: 400 });
  }
  if (!Number.isInteger(rawBody.value.revision) || Number(rawBody.value.revision) < 0) {
    return NextResponse.json({ error: 'A valid order revision is required.' }, { status: 400 });
  }
  const parsedInput = validateKitchenOrderInput(rawBody.value);
  if (!parsedInput.ok) {
    return NextResponse.json({ success: false, error: parsedInput.error }, { status: 400 });
  }
  const {
    customerName: customer_name,
    customerEmail: customer_email,
    customerPhone: customer_phone,
    items,
    hpField: hp_field,
    submittedAt: submitted_at,
  } = parsedInput.value;

  const ip = getClientIp(request);
  if (!await enforceRateLimit(`kitchen:${ip}`, 8, 60_000)) {
    return NextResponse.json({ success: false, error: 'Too many attempts. Try again shortly.' }, { status: 429 });
  }
  if (!enforceHoneypotAndTiming(hp_field, submitted_at)) {
    return NextResponse.json({ success: false, error: 'Invalid form submission.' }, { status: 400 });
  }
  if (!validateEmail(customer_email)) {
    return NextResponse.json({ success: false, error: 'Please provide a valid email address.' }, { status: 400 });
  }
  if (!validatePhone(customer_phone)) {
    return NextResponse.json({ success: false, error: 'Please provide a valid phone number.' }, { status: 400 });
  }

  const supabase = createServerClient();
  const itemIds = items.map((item) => item.itemId);
  const { data: dbItems, error: itemsError } = await supabase
    .from('kitchen_items')
    .select('id,name,price,is_available,is_hidden')
    .in('id', itemIds);

  if (itemsError) {
    console.error('Supabase kitchen items lookup error:', itemsError);
    return NextResponse.json({ success: false, error: 'Failed to submit order.' }, { status: 500 });
  }
  const byId = new Map((dbItems ?? []).map((i) => [i.id, i]));

  let totalCents = 0;
  const orderItems: Array<{ item_id: string; quantity: number; price: number; name: string }> = [];
  for (const row of items) {
    const matched = byId.get(row.itemId);
    if (!matched || !matched.is_available || matched.is_hidden) {
      return NextResponse.json({ success: false, error: 'One or more menu items are unavailable.' }, { status: 409 });
    }
    const price = audAmountToCents(matched.price);
    if (!price.ok || typeof matched.name !== 'string' || !matched.name.trim()) {
      return NextResponse.json({ success: false, error: 'Kitchen pricing is unavailable.' }, { status: 503 });
    }
    totalCents += row.quantity * price.value;
    if (!Number.isSafeInteger(totalCents) || totalCents > PUBLIC_ORDER_LIMITS.maximumOrderCents) {
      return NextResponse.json({ success: false, error: 'Kitchen order total exceeds the allowed limit.' }, { status: 400 });
    }
    orderItems.push({
      item_id: matched.id,
      quantity: row.quantity,
      price: price.value / 100,
      name: matched.name,
    });
  }
  if (totalCents <= 0) {
    return NextResponse.json({ success: false, error: 'Kitchen order total must be greater than zero.' }, { status: 400 });
  }
  const total = totalCents / 100;

  const paymentReference = await generateUniquePaymentReference('kitchen');

  const { data: saved, error: saveError } = await supabase.rpc('save_meal_order', {
    target_token: token, target_revision: rawBody.value.revision,
    target_reference: paymentReference, target_service_date: orderingWindow.serviceDate,
    target_request: {
      name: sanitiseInput(customer_name), email: sanitiseInput(customer_email), phone: sanitiseInput(customer_phone),
      collection_window: rawBody.value.collection_window, items: orderItems,
    },
  });
  if (saveError || !saved?.id) {
    return NextResponse.json({ error: 'Unable to save this order. A payment may be pending or another tab changed it. Refresh and try again.' }, { status: 409 });
  }

  const kitchenItemListHtml = orderItems
    .map((i) =>
      `<tr>
        <td style="padding:6px 8px;font-size:14px;border-bottom:1px solid #f3f4f6;">${escapeEmailHtml(i.name)}</td>
        <td style="padding:6px 8px;font-size:14px;text-align:center;border-bottom:1px solid #f3f4f6;">${i.quantity}</td>
        <td style="padding:6px 8px;font-size:14px;text-align:right;border-bottom:1px solid #f3f4f6;">$${(i.price * i.quantity).toFixed(2)}</td>
      </tr>`
    )
    .join('');
  const notification = await sendEmail({
    ...receiptRecipients(sanitiseInput(customer_email), getStaffOrderRecipients('kitchen')),
    idempotencyKey: `meal-order-${saved.id}-${saved.meal_revision}`,
    subject: `Kitchen order received - Ref ${saved.payment_reference} | NDCC Dinos`,
    html: emailHtml(
      'Kitchen Order Confirmation',
      `<p style="font-size:15px;color:#374151;line-height:1.6;">Hi ${escapeEmailHtml(sanitiseInput(customer_name))},</p>
      <p style="font-size:15px;color:#374151;line-height:1.6;">Your kitchen order has been received but is not yet marked paid. Return to the kitchen page to pay securely by Stripe, or use the bank transfer details below.</p>
      <p><strong>Collection:</strong> ${escapeEmailHtml(mealCollectionLabel(saved.meal_collection_window))}<br>${escapeEmailHtml(mealServiceLabel(saved.meal_service_date))} (Australia/Melbourne)</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:8px;font-size:13px;text-align:left;color:#6b7280;">Item</th>
            <th style="padding:8px;font-size:13px;text-align:center;color:#6b7280;">Qty</th>
            <th style="padding:8px;font-size:13px;text-align:right;color:#6b7280;">Price</th>
          </tr>
        </thead>
        <tbody>${kitchenItemListHtml}</tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="padding:10px 8px;font-size:14px;font-weight:bold;text-align:right;">Total</td>
            <td style="padding:10px 8px;font-size:15px;font-weight:bold;text-align:right;color:#800000;">$${total.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
      ${bankDetailsHtml(saved.payment_reference, total)}
      <p style="font-size:13px;color:#6b7280;">Questions? Contact us at <a href="mailto:ndcc.secretary1@gmail.com" style="color:#800000;">ndcc.secretary1@gmail.com</a>.</p>`
    ),
  });

  return NextResponse.json({ ...mealResponse(saved), notification_status: notification.status });
}

type SavedMeal = {
  id: string; payment_reference: string; total_amount: number; meal_collection_window: string;
  meal_service_date: string; meal_revision: number; meal_editing: boolean;
  payment_status: string; meal_request: unknown;
};

function mealResponse(order: SavedMeal) {
  return {
    success: true, order_id: order.id, total_amount: Number(order.total_amount),
    payment_reference: order.payment_reference, collection_window: order.meal_collection_window,
    service_date: order.meal_service_date, revision: order.meal_revision, editing: order.meal_editing,
    payment_status: order.payment_status, draft: order.meal_request,
    bank_details: { account_name: process.env.NDCC_BANK_ACCOUNT_NAME || '',
      bsb: process.env.NDCC_BANK_BSB || '', account_number: process.env.NDCC_BANK_ACCOUNT_NUMBER || '' },
  };
}

async function resumeOrEdit(request: Request, token: string, action: 'resume' | 'edit', revision: unknown) {
  if (!await enforceRateLimit(`meal-draft:${getClientIp(request)}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Too many attempts. Please wait.' }, { status: 429 });
  }
  const supabase = createServerClient();
  const { data: order, error } = await supabase.from('orders').select('*').eq('meal_draft_token', token).maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to load order.' }, { status: 503 });
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  if (action === 'resume') return NextResponse.json(mealResponse(order), { headers: { 'Cache-Control': 'no-store' } });
  const window = await getLiveKitchenOrderWindow();
  if (!window.open || order.meal_service_date !== window.serviceDate) {
    return NextResponse.json({ error: 'This meal order is outside its editing window. Contact the club for changes.' }, { status: 403 });
  }
  if (revision !== order.meal_revision || Number(order.amount_paid) > 0 || order.payment_status === 'paid') {
    return NextResponse.json({ error: 'This order changed or has a payment. Refresh before editing.' }, { status: 409 });
  }
  const attempts = await supabase.from('order_payments').select('id,provider,provider_reference,status')
    .eq('order_id', order.id).eq('status', 'pending');
  if (attempts.error) return NextResponse.json({ error: 'Unable to verify existing payments.' }, { status: 503 });
  for (const attempt of attempts.data || []) {
    // Never unlock an order while an unverified or in-flight Checkout may be payable.
    if (attempt.provider !== 'stripe' || !attempt.provider_reference) {
      return NextResponse.json({ error: 'A payment is being prepared. Retry payment to recover it, then choose Edit order again.' }, { status: 409 });
    }
    try {
      const stripe = getStripe();
      let session = await stripe.checkout.sessions.retrieve(attempt.provider_reference);
      if (session.metadata?.order_id !== order.id || session.status === 'complete') {
        return NextResponse.json({ error: 'A payment is being confirmed. This order cannot be edited.' }, { status: 409 });
      }
      if (session.status === 'open') session = await stripe.checkout.sessions.expire(session.id);
      if (session.status !== 'expired') throw new Error('Checkout not expired');
      const released = await supabase.from('order_payments').update({ status: 'failed', recorded_by: 'meal-order-edit' })
        .eq('id', attempt.id).eq('status', 'pending').eq('provider_reference', session.id);
      if (released.error) throw released.error;
    } catch {
      return NextResponse.json({ error: 'Unable to safely cancel the existing checkout. Please retry.' }, { status: 503 });
    }
  }
  const edited = await supabase.rpc('begin_meal_order_edit', { target_token: token, target_revision: revision });
  if (edited.error || !edited.data?.id) return NextResponse.json({ error: 'A payment started or the order changed. Refresh and try again.' }, { status: 409 });
  return NextResponse.json(mealResponse(edited.data));
}

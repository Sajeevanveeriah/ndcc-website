import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { enforceHoneypotAndTiming, enforceRateLimit, getClientIp } from '@/lib/server/request-guards';
import { generateUniquePaymentReference } from '@/lib/payments/reference';
import { validateEmail, validatePhone } from '@/lib/utils';
import { sendEmail, emailHtml, bankDetailsHtml } from '@/lib/email';

export async function POST(request: Request) {
  const body = await request.json();
  const { customer_name, customer_email, customer_phone, items, hp_field, submitted_at } = body;

  const ip = getClientIp(request);
  if (!enforceRateLimit(`kitchen:${ip}`, 8, 60_000)) {
    return NextResponse.json({ success: false, error: 'Too many attempts. Try again shortly.' }, { status: 429 });
  }
  if (!enforceHoneypotAndTiming(hp_field, submitted_at)) {
    return NextResponse.json({ success: false, error: 'Invalid form submission.' }, { status: 400 });
  }
  if (!customer_name || !customer_email || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ success: false, error: 'Name, email and kitchen items are required.' }, { status: 400 });
  }
  if (!validateEmail(customer_email)) {
    return NextResponse.json({ success: false, error: 'Please provide a valid email address.' }, { status: 400 });
  }
  if (!customer_phone || !validatePhone(customer_phone)) {
    return NextResponse.json({ success: false, error: 'Please provide a valid phone number.' }, { status: 400 });
  }

  const supabase = createServerClient();
  const itemIds = items.map((i: { item_id: string }) => i.item_id).filter(Boolean);
  const { data: dbItems, error: itemsError } = await supabase
    .from('kitchen_items')
    .select('id,name,price,is_available,is_hidden')
    .in('id', itemIds);

  if (itemsError) return NextResponse.json({ success: false, error: itemsError.message }, { status: 500 });
  const byId = new Map((dbItems ?? []).map((i) => [i.id, i]));

  let total = 0;
  const orderItems: Array<{ item_id: string; quantity: number; price: number; name: string }> = [];
  for (const row of items) {
    const matched = byId.get(row.item_id);
    if (!matched || !matched.is_available || matched.is_hidden) {
      return NextResponse.json({ success: false, error: 'One or more menu items are unavailable.' }, { status: 409 });
    }
    const qty = Math.max(1, Number(row.quantity || 1));
    const price = Number(matched.price || 0);
    total += qty * price;
    orderItems.push({ item_id: matched.id, quantity: qty, price, name: matched.name });
  }

  const paymentReference = await generateUniquePaymentReference();

  const { data: linkedOrder, error: linkedOrderError } = await supabase
    .from('orders')
    .insert({
      customer_name,
      customer_email,
      customer_phone: customer_phone || '',
      items: orderItems.map((i) => ({ name: i.name, size: 'kitchen', quantity: i.quantity, price: i.price })),
      total_amount: total,
      payment_status: 'pending_bank_transfer',
      payment_reference: paymentReference,
      order_category: 'kitchen',
      order_status: 'submitted',
      processed: false,
      notes: 'Kitchen order',
    })
    .select('id')
    .single();

  if (linkedOrderError) return NextResponse.json({ success: false, error: linkedOrderError.message }, { status: 500 });

  const { data: kitchenOrder, error: kitchenOrderError } = await supabase
    .from('kitchen_orders')
    .insert({
      customer_name,
      total_amount: total,
      status: 'submitted',
      payment_status: 'pending_bank_transfer',
      payment_reference: paymentReference,
      linked_order_id: linkedOrder.id,
      processed: false,
    })
    .select('id')
    .single();

  if (kitchenOrderError) return NextResponse.json({ success: false, error: kitchenOrderError.message }, { status: 500 });

  const { error: orderItemsError } = await supabase.from('kitchen_order_items').insert(
    orderItems.map((i) => ({
      order_id: kitchenOrder.id,
      item_id: i.item_id,
      quantity: i.quantity,
      price: i.price,
    }))
  );
  if (orderItemsError) return NextResponse.json({ success: false, error: orderItemsError.message }, { status: 500 });

  const kitchenItemListHtml = orderItems
    .map((i) =>
      `<tr>
        <td style="padding:6px 8px;font-size:14px;border-bottom:1px solid #f3f4f6;">${i.name}</td>
        <td style="padding:6px 8px;font-size:14px;text-align:center;border-bottom:1px solid #f3f4f6;">${i.quantity}</td>
        <td style="padding:6px 8px;font-size:14px;text-align:right;border-bottom:1px solid #f3f4f6;">$${(i.price * i.quantity).toFixed(2)}</td>
      </tr>`
    )
    .join('');
  void sendEmail({
    to: customer_email,
    subject: `Kitchen order confirmed — Ref ${paymentReference} | NDCC Dinos`,
    html: emailHtml(
      'Kitchen Order Confirmation',
      `<p style="font-size:15px;color:#374151;line-height:1.6;">Hi ${customer_name},</p>
      <p style="font-size:15px;color:#374151;line-height:1.6;">Your kitchen order has been received. Please complete payment using the bank transfer details below.</p>
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
      ${bankDetailsHtml(paymentReference, total)}
      <p style="font-size:13px;color:#6b7280;">Questions? Contact us at <a href="mailto:ndcc.secretary1@gmail.com" style="color:#800000;">ndcc.secretary1@gmail.com</a>.</p>`
    ),
  });
  return NextResponse.json({
    success: true,
    order_id: linkedOrder.id,
    kitchen_order_id: kitchenOrder.id,
    payment_reference: paymentReference,
    total_amount: total,
    bank_details: {
      account_name: process.env.NDCC_BANK_ACCOUNT_NAME || '',
      bsb: process.env.NDCC_BANK_BSB || '',
      account_number: process.env.NDCC_BANK_ACCOUNT_NUMBER || '',
    },
  });
}

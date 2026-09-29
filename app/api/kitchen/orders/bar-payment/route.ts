import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
import { enforceRateLimit, getClientIp } from '@/lib/server/request-guards';
import { TRANSFER_PAYABLE_STATUSES } from '@/lib/payments/bank-transfer';
import { isUuidV1ToV5 } from '@/lib/validation/uuid';

export const dynamic = 'force-dynamic';
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

// Kitchen purchasers can say they will pay cash at the bar on collection. The
// meal draft token (a random bearer secret kept in the purchaser's browser)
// authorises the change, the same as resuming or editing the meal order.
export async function POST(request: Request) {
  try {
    const parsed = await readLimitedJsonObject(request, 4096);
    const readOnly = parsed.ok && parsed.value.action === 'read';
    const allowed = readOnly || !parsed.ok
      ? await enforceRateLimit(`bar-payment-read:${getClientIp(request)}`, 60, 60_000)
      : await enforceRateLimit(`bar-payment:${getClientIp(request)}`, 12, 60_000);
    if (!allowed) return reply({ error: 'Too many attempts. Please wait a minute.' }, 429);
    if (!parsed.ok) return reply({ error: 'Invalid request.' }, 400);
    const { draft_token, order_id, selected } = parsed.value;
    if (typeof draft_token !== 'string' || !isUuidV1ToV5(draft_token) || typeof order_id !== 'string' || !isUuidV1ToV5(order_id)
      || (!readOnly && typeof selected !== 'boolean')) return reply({ error: 'Invalid request.' }, 400);

    const db = createServerClient();
    const { data: order, error } = await db.from('orders')
      .select('id,order_category,payment_status,order_status,total_amount,amount_paid,balance_due,bar_payment_selected_at')
      .eq('meal_draft_token', draft_token).eq('id', order_id).is('deleted_at', null).maybeSingle();
    if (error) return reply({ error: 'Pay at the bar is temporarily unavailable.' }, 503);
    if (!order || order.order_category !== 'kitchen') return reply({ error: 'No matching kitchen order was found.' }, 404);
    if (readOnly) return reply({ selected: Boolean(order.bar_payment_selected_at) });
    if (!TRANSFER_PAYABLE_STATUSES.includes(order.payment_status) || order.order_status === 'cancelled'
      || Number(order.balance_due ?? (Number(order.total_amount) - Number(order.amount_paid || 0))) <= 0) {
      return reply({ error: 'This order is no longer awaiting payment. Refresh your order.' }, 409);
    }
    // Only intent changes here. Choosing the bar replaces a bank deposit choice
    // so the order is listed under one payment method; staff record the cash.
    const patch = selected
      ? { bar_payment_selected_at: order.bar_payment_selected_at || new Date().toISOString(), bank_transfer_selected_at: null }
      : { bar_payment_selected_at: null };
    const updated = await db.from('orders').update(patch)
      .eq('id', order.id).eq('meal_draft_token', draft_token).eq('payment_status', order.payment_status)
      .neq('order_status', 'cancelled').is('deleted_at', null).select('id').maybeSingle();
    if (updated.error) return reply({ error: 'Your selection could not be saved. Please retry.' }, 503);
    if (!updated.data) return reply({ error: 'Your order changed. Refresh before trying again.' }, 409);
    return reply({ selected, message: selected ? 'Pay at the bar selected. Pay cash at the bar when you collect your order.' : 'Pay at the bar selection removed.' });
  } catch { return reply({ error: 'Your selection could not be saved. Please retry.' }, 503); }
}

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
import { enforceRateLimit, getClientIp } from '@/lib/server/request-guards';
import { deriveCapabilities, loadMerchPaymentSettings } from '@/lib/payments/capabilities';
import { configuredBankDetails, TRANSFER_PAYABLE_STATUSES } from '@/lib/payments/bank-transfer';
import { isUuidV1ToV5 } from '@/lib/validation/uuid';

export const dynamic = 'force-dynamic';
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function POST(request: Request) {
  try {
    const parsed = await readLimitedJsonObject(request, 4096);
    if (!parsed.ok) {
      if (!await enforceRateLimit(`bank-transfer-read:${getClientIp(request)}`, 60, 60_000)) return reply({ error: 'Too many attempts. Please wait a minute.' }, 429);
      return reply({ error: 'Invalid request.' }, 400);
    }
    const { order_id, email, token, selected, action } = parsed.value;
    // Status reads (the panel's initial load) have their own looser bucket so
    // they never use up the stricter limit on changing the selection.
    const allowed = action === 'read'
      ? await enforceRateLimit(`bank-transfer-read:${getClientIp(request)}`, 60, 60_000)
      : await enforceRateLimit(`bank-transfer:${getClientIp(request)}`, 12, 60_000);
    if (!allowed) return reply({ error: 'Too many attempts. Please wait a minute.' }, 429);
    if (typeof order_id !== 'string' || !isUuidV1ToV5(order_id) || (!(typeof token === 'string' && isUuidV1ToV5(token)) && !(typeof email === 'string' && email.trim() && email.length <= 254))
      || (action !== 'read' && typeof selected !== 'boolean')) return reply({ error: 'Enter the email used for this order.' }, 400);
    const db = createServerClient();
    let tokenAuthorised = false;
    if (typeof token === 'string' && token) {
      if (!isUuidV1ToV5(token)) return reply({ error: 'No matching order was found.' }, 404);
      const link = await db.from('apparel_balance_links').select('order_id').eq('token', token).eq('order_id', order_id).maybeSingle();
      if (link.error) return reply({ error: 'Bank transfer selection is temporarily unavailable.' }, 503);
      if (!link.data) return reply({ error: 'No matching order was found.' }, 404);
      tokenAuthorised = true;
    }
    const { data: order, error } = await db.from('orders')
      .select('id,customer_email,order_category,payment_status,order_status,total_amount,amount_paid,balance_due,bank_transfer_selected_at')
      .eq('id', order_id).is('deleted_at', null).maybeSingle();
    if (error) return reply({ error: 'Bank transfer selection is temporarily unavailable.' }, 503);
    if (!order || (tokenAuthorised ? order.order_category !== 'merch' : String(order.customer_email).trim().toLowerCase() !== String(email).trim().toLowerCase())) return reply({ error: 'No matching order was found.' }, 404);
    if (action === 'read') return reply({ selected: Boolean(order.bank_transfer_selected_at) });
    if (!TRANSFER_PAYABLE_STATUSES.includes(order.payment_status) || order.order_status === 'cancelled'
      || Number(order.balance_due ?? (Number(order.total_amount) - Number(order.amount_paid || 0))) <= 0) return reply({ error: 'This order is no longer awaiting payment. Refresh your order.' }, 409);
    if (selected && (!deriveCapabilities(await loadMerchPaymentSettings(db), order.order_category === 'donation' ? 'donation' : undefined).bank_transfer || !configuredBankDetails())) return reply({ error: 'Bank transfers are currently unavailable.' }, 409);
    // Only intent can change here. Settlement is exclusively the existing
    // authorised payment ledger / signed Stripe webhook workflow.
    const timestamp = selected ? order.bank_transfer_selected_at || new Date().toISOString() : null;
    const updated = await db.from('orders').update({ bank_transfer_selected_at: timestamp })
      .eq('id', order.id).eq('customer_email', order.customer_email).eq('payment_status', order.payment_status)
      .neq('order_status', 'cancelled').is('deleted_at', null).select('id').maybeSingle();
    if (updated.error) return reply({ error: 'Your selection could not be saved. Please retry.' }, 503);
    if (!updated.data) return reply({ error: 'Your order changed. Refresh before trying again.' }, 409);
    return reply({ selected, message: selected ? 'Bank transfer selected. The club will confirm when the funds arrive.' : 'Bank transfer selection removed.' });
  } catch { return reply({ error: 'Your selection could not be saved. Please retry.' }, 503); }
}

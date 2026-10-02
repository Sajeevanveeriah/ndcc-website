import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requireAnyPermission } from '@/lib/auth/guard';
import { hasPermission } from '@/lib/auth/permissions';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
import { isUuidV1ToV5 } from '@/lib/validation/uuid';
import { scheduleAdminAudit } from '@/lib/revisions/server';
import { PAYMENT_METHOD_CHOICES, paymentChoicePatch, type PaymentMethodChoice } from '@/lib/payments/method-choice';

export const dynamic = 'force-dynamic';
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

// Committee members set or correct the stated payment method on any order,
// past or present (for example "paid at the bar" for a kitchen order placed
// online). It is intent only: money is still recorded in the payment ledger.
// Orders permission covers every order; kitchen permission covers kitchen orders.
export async function POST(request: Request) {
  const user = await requireAnyPermission(['orders', 'kitchen']);
  if (!user) return reply({ success: false, error: 'Forbidden.' }, 403);
  const parsed = await readLimitedJsonObject(request, 4096);
  if (!parsed.ok) return reply({ success: false, error: parsed.error }, 400);
  const { order_id, method } = parsed.value;
  if (typeof order_id !== 'string' || !isUuidV1ToV5(order_id)) return reply({ success: false, error: 'Choose an order.' }, 400);
  if (method !== null && !(PAYMENT_METHOD_CHOICES as readonly unknown[]).includes(method)) {
    return reply({ success: false, error: 'Choose Stripe, bank transfer or pay at the club.' }, 400);
  }

  const db = createServerClient();
  const { data: order, error } = await db.from('orders')
    .select('id,order_category,payment_method_choice,bank_transfer_selected_at,bar_payment_selected_at,deleted_at')
    .eq('id', order_id).maybeSingle();
  if (error) return reply({ success: false, error: 'Orders are temporarily unavailable.' }, 503);
  if (!order) return reply({ success: false, error: 'Order not found.' }, 404);
  if (!hasPermission(user, 'orders') && order.order_category !== 'kitchen') {
    return reply({ success: false, error: 'Kitchen access covers kitchen orders only.' }, 403);
  }

  const actor = user.email || user.id || 'committee-admin';
  const patch = paymentChoicePatch(order, method as PaymentMethodChoice | null, actor, new Date().toISOString());
  const updated = await db.from('orders').update(patch).eq('id', order.id)
    .select('id,payment_method_choice,payment_method_choice_at,payment_method_choice_source,payment_method_choice_by,bank_transfer_selected_at,bar_payment_selected_at')
    .maybeSingle();
  if (updated.error) {
    const missing = /payment_method_choice|schema cache|column/i.test(updated.error.message || '');
    return reply({ success: false, error: missing ? 'Payment method recording is not available until the database update is applied.' : 'The payment method could not be saved.' }, missing ? 409 : 503);
  }
  if (!updated.data) return reply({ success: false, error: 'Order not found.' }, 404);
  scheduleAdminAudit({
    actor: user,
    action: 'update',
    resource: 'orders',
    recordId: order.id,
    summary: `Payment method set to ${method ?? 'not recorded'} (was ${order.payment_method_choice ?? 'not recorded'})`,
  });
  return reply({ success: true, order: updated.data });
}

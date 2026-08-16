import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/auth/guard';
import { sendPaidStaffOrderNotificationForPayment } from '@/lib/order-notifications';

export const dynamic = 'force-dynamic';

const MANUAL_METHODS = ['bank_transfer', 'cash', 'other'] as const;

export async function GET(request: Request) {
  const user = await requirePermission('orders');
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get('order_id');

  const supabase = createServerClient();
  let query = supabase
    .from('order_payments')
    .select('id,order_id,amount,currency,method,provider,provider_reference,status,received_at,recorded_by,notes,reverses_payment_id,created_at')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (orderId) query = query.eq('order_id', orderId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: data ?? [] });
}

export async function POST(request: Request) {
  const user = await requirePermission('orders', ['admin']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const body = await request.json();
  const supabase = createServerClient();
  const recordedBy = user.email || user.id || 'committee-admin';

  if (typeof body.void_payment_id === 'string' && body.void_payment_id) {
    const { data: target, error: findError } = await supabase
      .from('order_payments')
      .select('id,status')
      .eq('id', body.void_payment_id)
      .maybeSingle();
    if (findError || !target) return NextResponse.json({ success: false, error: 'Payment not found.' }, { status: 404 });
    if (target.status !== 'pending' && target.status !== 'failed') {
      return NextResponse.json(
        { success: false, error: 'Only pending or failed payments can be voided. Use a reversal for settled payments.' },
        { status: 400 }
      );
    }
    const { data, error } = await supabase
      .from('order_payments')
      .update({ status: 'void', notes: typeof body.notes === 'string' ? body.notes : undefined, recorded_by: recordedBy })
      .eq('id', target.id)
      .select()
      .single();
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data });
  }

  if (typeof body.reverses_payment_id === 'string' && body.reverses_payment_id) {
    const { data: original, error: findError } = await supabase
      .from('order_payments')
      .select('id,order_id,amount,method,status')
      .eq('id', body.reverses_payment_id)
      .maybeSingle();
    if (findError || !original) return NextResponse.json({ success: false, error: 'Payment not found.' }, { status: 404 });
    if (original.status !== 'settled') {
      return NextResponse.json({ success: false, error: 'Only settled payments can be reversed.' }, { status: 400 });
    }
    const { data: existingReversal } = await supabase
      .from('order_payments')
      .select('id')
      .eq('reverses_payment_id', original.id)
      .eq('status', 'refunded')
      .maybeSingle();
    if (existingReversal) {
      return NextResponse.json({ success: false, error: 'This payment has already been reversed.' }, { status: 409 });
    }
    const { data, error } = await supabase
      .from('order_payments')
      .insert({
        order_id: original.order_id,
        amount: original.amount,
        method: original.method,
        status: 'refunded',
        reverses_payment_id: original.id,
        received_at: new Date().toISOString(),
        recorded_by: recordedBy,
        notes: typeof body.notes === 'string' && body.notes ? body.notes : 'Reversal of recorded payment',
      })
      .select()
      .single();
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data });
  }

  const orderId = typeof body.order_id === 'string' ? body.order_id.trim() : '';
  const amount = Number(body.amount);
  const method = String(body.method || '');
  if (!orderId) return NextResponse.json({ success: false, error: 'order_id is required.' }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ success: false, error: 'Amount must be greater than zero.' }, { status: 400 });
  }
  if (!(MANUAL_METHODS as readonly string[]).includes(method)) {
    return NextResponse.json(
      { success: false, error: `Method must be one of: ${MANUAL_METHODS.join(', ')}. Card payments arrive via the Stripe webhook.` },
      { status: 400 }
    );
  }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id,total_amount,amount_paid')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError || !order) return NextResponse.json({ success: false, error: 'Order not found.' }, { status: 404 });

  const { data, error } = await supabase
    .from('order_payments')
    .insert({
      order_id: orderId,
      amount: Math.round(amount * 100) / 100,
      method,
      status: 'settled',
      received_at: typeof body.received_at === 'string' && body.received_at ? body.received_at : new Date().toISOString(),
      recorded_by: recordedBy,
      notes: typeof body.notes === 'string' ? body.notes : '',
      ...(typeof body.provider_reference === 'string' && body.provider_reference
        ? { provider_reference: body.provider_reference }
        : {}),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  const { data: updatedOrder } = await supabase
    .from('orders')
    .select('id,amount_paid,balance_due,payment_status,order_status,needs_review_reason')
    .eq('id', orderId)
    .maybeSingle();

  let staffNotificationStatus: string | null = null;
  if (updatedOrder?.payment_status === 'paid') {
    const notification = await sendPaidStaffOrderNotificationForPayment(
      supabase,
      { id: data.id, metadata: data.metadata || null },
      orderId,
    );
    staffNotificationStatus = notification.status;
    if (notification.status === 'failed') {
      console.error(`Manual payment staff notification for order ${orderId} failed:`, notification.reason);
    }
  }

  return NextResponse.json({
    success: true,
    data,
    order: updatedOrder ?? null,
    staff_notification_status: staffNotificationStatus,
  });
}

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { checkKitchenOrderUnpaid, markKitchenOrderPaid, type KitchenPaymentResult } from '@/lib/kitchen-mark-paid';
import { kitchenSpecialRequest } from '@/lib/kitchen-special-request';
import { effectivePaymentChoice } from '@/lib/payments/method-choice';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await requirePermission('kitchen');
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const supabase = createServerClient();
  let query = supabase
    .from('kitchen_orders')
    .select('*, kitchen_order_items(quantity, price, kitchen_items(name))')
    .order('created_at', { ascending: false });
  if(new URL(request.url).searchParams.get('deleted')!=='include')query=query.is('deleted_at',null);
  const {data,error}=await query;

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  const rows = data ?? [];
  // Special requests live on the linked online order; a failed read leaves the list usable.
  const linkedIds = [...new Set(rows.map((row) => row.linked_order_id).filter((id): id is string => typeof id === 'string'))];
  const requests = new Map<string, string>();
  // The purchaser's stated payment method (Stripe, bank transfer or pay at the bar) from the linked online order.
  const methods = new Map<string, { payment_method_choice: string | null; payment_method_choice_source: string | null }>();
  for (let start = 0; start < linkedIds.length; start += 200) {
    const ids = linkedIds.slice(start, start + 200);
    type LinkedOrder = { id: string; meal_request?: unknown; bank_transfer_selected_at?: string | null; bar_payment_selected_at?: string | null; payment_method_choice?: string | null; payment_method_choice_source?: string | null };
    let linkedResult: { data: LinkedOrder[] | null; error: { message: string } | null } = await supabase.from('orders')
      .select('id,meal_request,bank_transfer_selected_at,bar_payment_selected_at,payment_method_choice,payment_method_choice_source')
      .in('id', ids);
    // Before the payment method migration the stated method comes from the intent columns.
    if (linkedResult.error && /payment_method_choice|schema cache|column/i.test(linkedResult.error.message || '')) {
      linkedResult = await supabase.from('orders').select('id,meal_request,bank_transfer_selected_at,bar_payment_selected_at').in('id', ids);
    }
    const { data: linked, error: linkedError } = linkedResult;
    if (linkedError) { console.error('Kitchen special requests unavailable:', linkedError.message); break; }
    for (const order of linked ?? []) {
      const text = kitchenSpecialRequest(order.meal_request);
      if (text) requests.set(order.id, text);
      methods.set(order.id, { payment_method_choice: effectivePaymentChoice(order), payment_method_choice_source: order.payment_method_choice_source ?? null });
    }
  }
  return NextResponse.json({ success: true, data: rows.map((row) => ({
    ...row,
    special_request: requests.get(row.linked_order_id) || '',
    payment_method_choice: methods.get(row.linked_order_id)?.payment_method_choice ?? null,
    payment_method_choice_source: methods.get(row.linked_order_id)?.payment_method_choice_source ?? null,
  })) });
}

export async function PATCH(request: Request) {
  const user = await requirePermission('kitchen', ['admin']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const { id, status, payment_status, processed } = await request.json();
  if (!id) return NextResponse.json({ success: false, error: 'id is required.' }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (typeof status === 'string' && status) patch.status = status;
  if (typeof processed === 'boolean') patch.processed = processed;
  const paymentChange = typeof payment_status === 'string' && payment_status ? payment_status : null;
  if (Object.keys(patch).length === 0 && !paymentChange) {
    return NextResponse.json({ success: false, error: 'No valid fields provided.' }, { status: 400 });
  }

  const supabase = createServerClient();
  let payment: Extract<KitchenPaymentResult, { ok: true }> | null = null;
  if (paymentChange) {
    const { data: kitchen, error: kitchenError } = await supabase.from('kitchen_orders').select('id,linked_order_id').eq('id', id).maybeSingle();
    if (kitchenError) return NextResponse.json({ success: false, error: 'Could not load the kitchen order.' }, { status: 503 });
    if (!kitchen) return NextResponse.json({ success: false, error: 'Kitchen order not found.' }, { status: 404 });
    if (kitchen.linked_order_id) {
      // Online orders are paid through the order ledger so the export, Admin > Orders,
      // the receipt and the staff email all agree; the kitchen row follows by trigger.
      const result = paymentChange === 'paid'
        ? await markKitchenOrderPaid(supabase, kitchen.linked_order_id, user.email || user.id || 'committee-admin')
        : await checkKitchenOrderUnpaid(supabase, kitchen.linked_order_id);
      if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: result.status });
      payment = result;
    } else {
      // Legacy kitchen rows with no online order keep the simple status switch.
      patch.payment_status = paymentChange;
    }
  }
  if (Object.keys(patch).length) {
    const { error } = await supabase.from('kitchen_orders').update(patch).eq('id', id);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    success: true,
    ...(payment ? { already_paid: payment.alreadyPaid, customer_receipt_status: payment.customerReceiptStatus, staff_notification_status: payment.staffNotificationStatus } : {}),
  });
}

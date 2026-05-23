import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { enforceHoneypotAndTiming, enforceRateLimit, getClientIp } from '@/lib/server/request-guards';
import { generateUniquePaymentReference } from '@/lib/payments/reference';
import { sendEmail, emailHtml, bankDetailsHtml } from '@/lib/email';

function sanitiseInput(str: string): string {
  return str.replace(/<[^>]*>/g, '').trim();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function GET() {
  const supabase = createServerClient();

  const [{ data: plans }, { data: addons }] = await Promise.all([
    supabase.from('social_membership_plans').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    supabase.from('social_membership_addons').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
  ]);

  return NextResponse.json({ success: true, plans: plans || [], addons: addons || [] });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { full_name, email, phone, notes, membership_plan_id, addons, hp_field, submitted_at } = body;

  const ip = getClientIp(request);
  if (!enforceRateLimit(`membership:${ip}`, 6, 60_000)) {
    return NextResponse.json({ success: false, error: 'Too many requests. Please try again shortly.' }, { status: 429 });
  }

  if (!enforceHoneypotAndTiming(hp_field, submitted_at)) {
    return NextResponse.json({ success: false, error: 'Invalid form submission.' }, { status: 400 });
  }

  if (!full_name || !email || !membership_plan_id) {
    return NextResponse.json({ success: false, error: 'Name, email, and membership plan are required.' }, { status: 400 });
  }

  if (!isValidEmail(email)) {
    return NextResponse.json({ success: false, error: 'Please enter a valid email address.' }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: plan } = await supabase
    .from('social_membership_plans')
    .select('id, name, price')
    .eq('id', membership_plan_id)
    .eq('is_active', true)
    .single();

  if (!plan) {
    return NextResponse.json({ success: false, error: 'Selected membership plan is unavailable.' }, { status: 400 });
  }

  const addonIds: string[] = Array.isArray(addons) ? addons.map((a: { addon_id: string }) => a.addon_id) : [];
  const { data: addonRows } = addonIds.length > 0
    ? await supabase.from('social_membership_addons').select('id, name, price').in('id', addonIds).eq('is_active', true)
    : { data: [] };

  const addonMap = new Map((addonRows || []).map((a) => [a.id, a]));
  const validatedAddons = (Array.isArray(addons) ? addons : [])
    .map((a: { addon_id: string; quantity?: number }) => ({
      addon: addonMap.get(a.addon_id),
      quantity: Math.max(1, Number(a.quantity || 1)),
    }))
    .filter((a) => a.addon);

  const totalAmount = Number(plan.price) + validatedAddons.reduce((sum, item) => sum + Number(item.addon?.price || 0) * item.quantity, 0);

  const orderItems = [
    { name: plan.name, size: 'membership', quantity: 1, price: Number(plan.price) },
    ...validatedAddons.map((item) => ({ name: item.addon?.name, size: 'addon', quantity: item.quantity, price: Number(item.addon?.price || 0) })),
  ];

  const paymentReference = await generateUniquePaymentReference();

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      customer_name: sanitiseInput(full_name),
      customer_email: sanitiseInput(email),
      customer_phone: phone ? sanitiseInput(phone) : '',
      items: orderItems,
      total_amount: totalAmount,
      payment_status: 'pending_bank_transfer',
      payment_reference: paymentReference,
      processed: false,
      notes: notes ? sanitiseInput(notes) : '',
    })
    .select('id')
    .single();

  if (orderError || !order) {
    return NextResponse.json({ success: false, error: 'Unable to create order.' }, { status: 500 });
  }

  const { data: application, error: appError } = await supabase
    .from('member_applications')
    .insert({
      full_name: sanitiseInput(full_name),
      email: sanitiseInput(email),
      phone: phone ? sanitiseInput(phone) : '',
      notes: notes ? sanitiseInput(notes) : '',
      membership_plan_id,
      order_id: order.id,
      status: 'submitted',
    })
    .select('id')
    .single();

  if (appError || !application) {
    await supabase.from('orders').delete().eq('id', order.id);
    return NextResponse.json({ success: false, error: 'Unable to submit membership application.' }, { status: 500 });
  }

  if (validatedAddons.length > 0) {
    const { error: addonInsertError } = await supabase.from('member_addon_selections').insert(
      validatedAddons.map((item) => ({
        member_application_id: application.id,
        addon_id: item.addon?.id,
        quantity: item.quantity,
      }))
    );
    if (addonInsertError) {
      await supabase.from('member_addon_selections').delete().eq('member_application_id', application.id);
      await supabase.from('member_applications').delete().eq('id', application.id);
      await supabase.from('orders').delete().eq('id', order.id);
      return NextResponse.json({ success: false, error: 'Unable to save add-on selections.' }, { status: 500 });
    }
  }

  void sendEmail({
    to: sanitiseInput(email),
    subject: `Membership signup confirmed — Ref ${paymentReference} | NDCC Dinos`,
    html: emailHtml(
      'Membership Signup Confirmed',
      `<p style="font-size:15px;color:#374151;line-height:1.6;">Hi ${sanitiseInput(full_name)},</p>
      <p style="font-size:15px;color:#374151;line-height:1.6;">Your membership signup for <strong>${plan.name}</strong> has been received.</p>
      ${bankDetailsHtml(paymentReference, Number(plan.price))}
      <p style="font-size:14px;color:#374151;line-height:1.6;">Your membership will be activated once we confirm your payment. If you have any questions, reach out at <a href="mailto:ndcc.secretary1@gmail.com" style="color:#800000;">ndcc.secretary1@gmail.com</a>.</p>`
    ),
  });
  return NextResponse.json({
    success: true,
    application_id: application.id,
    order_id: order.id,
    payment_reference: paymentReference,
    bank_details: {
      account_name: process.env.NDCC_BANK_ACCOUNT_NAME || '',
      bsb: process.env.NDCC_BANK_BSB || '',
      account_number: process.env.NDCC_BANK_ACCOUNT_NUMBER || '',
    },
  });
}

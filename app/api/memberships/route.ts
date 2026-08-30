import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { enforceHoneypotAndTiming, enforceRateLimit, getClientIp } from '@/lib/server/request-guards';
import { generateUniquePaymentReference } from '@/lib/payments/reference';
import { sendEmail, emailHtml, bankDetailsHtml, escapeEmailHtml } from '@/lib/email';
import { fallbackMembershipAddons, fallbackMembershipPlans } from '@/lib/fallback-content';
import { validateEmail, validatePhone } from '@/lib/utils';
import {
  PUBLIC_ORDER_LIMITS,
  audAmountToCents,
  readLimitedJsonObject,
  validateMembershipOrderInput,
} from '@/lib/order-input-validation';

export const dynamic = 'force-dynamic';

function sanitiseInput(str: string): string {
  return str.replace(/<[^>]*>/g, '').trim();
}

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ success: true, plans: fallbackMembershipPlans, addons: fallbackMembershipAddons });
  }

  try {
    const supabase = createServerClient();

    const [{ data: plans }, { data: addons }] = await Promise.all([
      supabase.from('social_membership_plans').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
      supabase.from('social_membership_addons').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    ]);

    return NextResponse.json({
      success: true,
      plans: plans?.length ? plans : fallbackMembershipPlans,
      addons: addons?.length ? addons : fallbackMembershipAddons,
    });
  } catch {
    return NextResponse.json({ success: true, plans: fallbackMembershipPlans, addons: fallbackMembershipAddons });
  }
}

export async function POST(request: Request) {
  const rawBody = await readLimitedJsonObject(request);
  if (!rawBody.ok) {
    const status = rawBody.error === 'Request body is too large.' ? 413 : 400;
    return NextResponse.json({ success: false, error: rawBody.error }, { status });
  }
  const parsedInput = validateMembershipOrderInput(rawBody.value);
  if (!parsedInput.ok) {
    return NextResponse.json({ success: false, error: parsedInput.error }, { status: 400 });
  }
  const {
    fullName: full_name,
    email,
    phone,
    notes,
    membershipPlanId: membership_plan_id,
    addons,
    hpField: hp_field,
    submittedAt: submitted_at,
  } = parsedInput.value;

  const ip = getClientIp(request);
  if (!enforceRateLimit(`membership:${ip}`, 6, 60_000)) {
    return NextResponse.json({ success: false, error: 'Too many requests. Please try again shortly.' }, { status: 429 });
  }

  if (!enforceHoneypotAndTiming(hp_field, submitted_at)) {
    return NextResponse.json({ success: false, error: 'Invalid form submission.' }, { status: 400 });
  }

  if (!validateEmail(email)) {
    return NextResponse.json({ success: false, error: 'Please enter a valid email address.' }, { status: 400 });
  }
  if (phone && !validatePhone(phone)) {
    return NextResponse.json({ success: false, error: 'Please enter a valid phone number.' }, { status: 400 });
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

  const planPrice = audAmountToCents(plan.price);
  if (!planPrice.ok || typeof plan.name !== 'string' || !plan.name.trim()) {
    return NextResponse.json({ success: false, error: 'Membership pricing is unavailable.' }, { status: 503 });
  }

  const addonIds = addons.map((addon) => addon.addonId);
  const { data: addonRows, error: addonRowsError } = addonIds.length > 0
    ? await supabase.from('social_membership_addons').select('id, name, price').in('id', addonIds).eq('is_active', true)
    : { data: [], error: null };

  if (addonRowsError) {
    return NextResponse.json({ success: false, error: 'Unable to validate membership add-ons.' }, { status: 503 });
  }
  if ((addonRows || []).length !== addonIds.length) {
    return NextResponse.json({ success: false, error: 'One or more selected membership add-ons are unavailable.' }, { status: 409 });
  }

  const addonMap = new Map((addonRows || []).map((a) => [a.id, a]));
  const validatedAddons: Array<{
    addon: { id: string; name: string; price: number };
    quantity: number;
    unitCents: number;
  }> = [];
  let totalCents = planPrice.value;
  for (const selection of addons) {
    const addon = addonMap.get(selection.addonId);
    const addonPrice = audAmountToCents(addon?.price);
    if (!addon || !addonPrice.ok || typeof addon.name !== 'string' || !addon.name.trim()) {
      return NextResponse.json({ success: false, error: 'Membership add-on pricing is unavailable.' }, { status: 503 });
    }
    totalCents += addonPrice.value * selection.quantity;
    if (!Number.isSafeInteger(totalCents) || totalCents > PUBLIC_ORDER_LIMITS.maximumOrderCents) {
      return NextResponse.json({ success: false, error: 'Membership order total exceeds the allowed limit.' }, { status: 400 });
    }
    validatedAddons.push({
      addon: { id: addon.id, name: addon.name, price: addonPrice.value / 100 },
      quantity: selection.quantity,
      unitCents: addonPrice.value,
    });
  }

  if (totalCents <= 0) {
    return NextResponse.json({ success: false, error: 'Selected membership total is invalid.' }, { status: 400 });
  }
  const totalAmount = totalCents / 100;

  const orderItems = [
    { name: plan.name, size: 'membership', quantity: 1, price: planPrice.value / 100 },
    ...validatedAddons.map((item) => ({
      name: item.addon.name,
      size: 'addon',
      quantity: item.quantity,
      price: item.unitCents / 100,
    })),
  ];

  const paymentReference = await generateUniquePaymentReference('membership');

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
      order_category: 'membership',
      order_status: 'submitted',
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
        addon_id: item.addon.id,
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
    subject: `Membership signup confirmed - Ref ${paymentReference} | NDCC Dinos`,
    html: emailHtml(
      'Membership Signup Confirmed',
      `<p style="font-size:15px;color:#374151;line-height:1.6;">Hi ${escapeEmailHtml(sanitiseInput(full_name))},</p>
      <p style="font-size:15px;color:#374151;line-height:1.6;">Your membership signup for <strong>${escapeEmailHtml(plan.name)}</strong> has been received.</p>
      ${bankDetailsHtml(paymentReference, totalAmount)}
      <p style="font-size:14px;color:#374151;line-height:1.6;">Your membership will be activated once we confirm your payment. If you have any questions, reach out at <a href="mailto:ndcc.secretary1@gmail.com" style="color:#800000;">ndcc.secretary1@gmail.com</a>.</p>`
    ),
  });
  return NextResponse.json({
    success: true,
    application_id: application.id,
    order_id: order.id,
    total_amount: totalAmount,
    payment_reference: paymentReference,
    bank_details: {
      account_name: process.env.NDCC_BANK_ACCOUNT_NAME || '',
      bsb: process.env.NDCC_BANK_BSB || '',
      account_number: process.env.NDCC_BANK_ACCOUNT_NUMBER || '',
    },
  });
}

import { configuredBankDetails } from '@/lib/payments/bank-transfer';
import { deriveCapabilities, loadMerchPaymentSettings } from '@/lib/payments/capabilities';
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { enforceRateLimit, getClientIp } from '@/lib/server/request-guards';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
import { POST as createCheckout } from '../checkout-session/route';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
export async function POST(request: Request) {
  if (!await enforceRateLimit(`balance-lookup:${getClientIp(request)}`, 8, 60_000)) return NextResponse.json({error:'Too many attempts. Please wait a minute.'},{status:429,headers:noStore});
  const parsed = await readLimitedJsonObject(request, 4096);
  if (!parsed.ok) return NextResponse.json({error:'Invalid request.'},{status:400,headers:noStore});
  const body = parsed.value;
  const reference = typeof body.reference === 'string' ? body.reference.trim().toUpperCase() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const token = typeof body.token === 'string' ? body.token : '';
  const db = createServerClient();
  let orderId: string | null = null;
  if (/^[0-9a-f-]{36}$/i.test(token)) {
    const link = await db.from('apparel_balance_links').select('order_id').eq('token',token).maybeSingle();
    if (link.error) return NextResponse.json({error:'Payment lookup is temporarily unavailable.'},{status:503,headers:noStore});
    orderId = link.data?.order_id || null;
  } else if (!reference || reference.length > 80 || !email || email.length > 254) {
    return NextResponse.json({error:'Enter your order reference and the email used for your order.'},{status:400,headers:noStore});
  }
  let query = db.from('orders').select('id,payment_reference,customer_email,total_amount,amount_paid,balance_due,payment_status,order_status,order_category,meal_draft_token,meal_revision,bank_transfer_selected_at').is('deleted_at',null);
  query = token ? query.eq('id',orderId || '00000000-0000-0000-0000-000000000000') : query.eq('payment_reference',reference);
  const {data:order,error} = await query.maybeSingle();
  if (error) return NextResponse.json({error:'Payment lookup is temporarily unavailable.'},{status:503,headers:noStore});
  if (!order && !token && /^NDCC(RAF|DCO)-/.test(reference)) {
    const raffle = reference.startsWith('NDCCRAF-');
    const result = await db.from(raffle ? 'raffle_orders' : 'fantasy_entries')
      .select(raffle ? 'id,customer_email,payment_reference,amount_cents,status,bank_transfer_selected_at' : 'id,payment_reference,entry_fee_cents,status,bank_transfer_selected_at,fantasy_managers(email)')
      .eq('payment_reference', reference).maybeSingle();
    if (result.error) return NextResponse.json({error:'Payment lookup is temporarily unavailable.'},{status:503,headers:noStore});
    const special = result.data as Record<string, unknown> | null;
    const manager = Array.isArray(special?.fantasy_managers) ? special.fantasy_managers[0] : special?.fantasy_managers;
    const buyerEmail = String(raffle ? special?.customer_email : (manager as {email?:string} | null)?.email || '').trim().toLowerCase();
    if (!special || buyerEmail !== email || !special.bank_transfer_selected_at) return NextResponse.json({error:'No matching order was found. Check your reference and email.'},{status:404,headers:noStore});
    if (body.checkout === true) return NextResponse.json({error:'Bank deposit is selected. Contact the club before paying again by card.'},{status:409,headers:noStore});
    const capabilities = deriveCapabilities(await loadMerchPaymentSettings(db));
    const total = Number(raffle ? special.amount_cents : special.entry_fee_cents) / 100;
    const paid = special.status === 'paid' ? total : 0;
    return NextResponse.json({kind:raffle?'raffle':'dino',order_id:special.id,reference:special.payment_reference,total,paid,balance:total-paid,status:special.status,cancelled:['cancelled','refunded','disputed','partially_refunded'].includes(String(special.status)),bank_transfer_selected:true,bank_details:capabilities.bank_transfer?configuredBankDetails():null,capabilities:{...capabilities,card:false}}, {headers:noStore});
  }
  if (!order || (token && order.order_category !== 'merch') || (!token && String(order.customer_email).trim().toLowerCase() !== email)) return NextResponse.json({error:'No matching order was found. Check your reference and email.'},{status:404,headers:noStore});
  if (body.checkout === true) {
    if (['refunded','partially_refunded','needs_review'].includes(order.payment_status)) return NextResponse.json({error:'Please contact the club about this order.'},{status:409,headers:noStore});
    // Reuse the existing reservation, idempotency and signed-webhook flow.
    // Neither the browser nor this lookup can mark the order paid.
    return createCheckout(new Request(new URL('/api/payments/checkout-session',request.url), {
      method:'POST',headers:request.headers,body:JSON.stringify({order_id:order.id,...(order.order_category === 'kitchen' ? {meal_draft_token:order.meal_draft_token,meal_revision:order.meal_revision} : {}),return_path: order.order_category === 'kitchen' ? '/kitchen' : order.order_category === 'membership' ? '/join' : order.order_category === 'donation' ? '/sponsors/donate' : order.order_category === 'event' ? '/events' : '/merchandise'}),
    }));
  }
  const capabilities = deriveCapabilities(await loadMerchPaymentSettings(db));
  return NextResponse.json({order_id: order.id, bank_details: capabilities.bank_transfer ? configuredBankDetails() : null, capabilities, bank_transfer_selected: Boolean(order.bank_transfer_selected_at), reference:order.payment_reference,total:Number(order.total_amount),paid:Number(order.amount_paid),balance:Number(order.balance_due),status:order.payment_status,cancelled:order.order_status==='cancelled'}, {headers:noStore});
}

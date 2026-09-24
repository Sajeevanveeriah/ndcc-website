import { NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/fantasy-manager-auth';
import { isRafflePublic } from '@/lib/raffle-visibility';
import { createServerClient } from '@/lib/supabase-server';
import { readLimitedJsonObject, validateRaffleCheckoutInput } from '@/lib/order-input-validation';
import { validateEmail, validatePhone } from '@/lib/utils';
import { enforceRateLimit } from '@/lib/server/request-guards';
import { enqueuePaymentReceiptJob, attemptPaymentReceiptDelivery } from '@/lib/payments/receipt-delivery';
export const dynamic = 'force-dynamic';
const reply=(body:object,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const saleKeyPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function deliveryStatusForSale(db:ReturnType<typeof createServerClient>,orderId:string){
 try{
  const {data,error}=await db.from('receipt_delivery_jobs').select('status').eq('raffle_order_id',orderId).maybeSingle();
  return !error&&data?.status?String(data.status):'unknown';
 }catch{return 'unknown';}
}
async function memberCollector(request:Request){
 const user=await getAuthUserFromRequest(request);
 if(!user?.email_confirmed_at||!user.email)return {member:null,error:'Sign in with a confirmed club account to record cash sales.',status:401};
 const {data,error}=await createServerClient().from('club_members').select('id,full_name,membership_status,privacy_accepted_at').eq('auth_user_id',user.id).maybeSingle();
 if(error)return {member:null,error:'Your club details could not be checked. Please retry.',status:503};
 if(!data||!data.privacy_accepted_at)return {member:null,error:'Save your name and accept the privacy statement in My Account before recording cash sales.',status:403};
 if(data.membership_status==='inactive')return {member:null,error:'This club account is inactive. Please contact the club.',status:403};
 return {member:data,error:null,status:200};
}
export async function GET(request:Request){
 const auth=await memberCollector(request);if(!auth.member)return reply({success:false,error:auth.error},auth.status);
 const db=createServerClient();
 const {data,error}=await db.from('raffle_campaigns').select('name,price_cents,active,draw_at').eq('code','NDCCRAF').single();
 if(error)return reply({success:false,error:'The trailer raffle could not be loaded.'},503);
 const key=new URL(request.url).searchParams.get('sale');
 let sale=null;
 if(key){
  if(!saleKeyPattern.test(key))return reply({success:false,error:'Invalid sale reference.'},400);
  const result=await db.from('raffle_orders').select('id,amount_cents,payment_reference,raffle_tickets(ticket_reference,ticket_number)').eq('cash_sale_key',key).eq('cash_received_by_member',auth.member.id).maybeSingle();
  if(result.error)return reply({success:false,error:'Unable to check the previous sale. Retry before accepting more cash.'},503);
  if(result.data)sale={amountCents:result.data.amount_cents,paymentReference:result.data.payment_reference,ticketReferences:result.data.raffle_tickets.sort((a:{ticket_number:number},b:{ticket_number:number})=>a.ticket_number-b.ticket_number).map((ticket:{ticket_reference:string})=>ticket.ticket_reference),deliveryStatus:await deliveryStatusForSale(db,result.data.id)};
 }
 const visible=await isRafflePublic();
 return reply({success:true,campaign:{...data,active:data.active&&visible},sale,collectorName:auth.member.full_name});
}
export async function POST(request:Request){
 const auth=await memberCollector(request);if(!auth.member)return reply({success:false,error:auth.error},auth.status);
 if(!await enforceRateLimit(`raffle-cash:${auth.member.id}`,30,60_000))return reply({success:false,error:'Please wait a minute before recording another sale.'},429);
 const body=await readLimitedJsonObject(request,16*1024);
 if(!body.ok)return reply({success:false,error:body.error},400);
 const parsed=validateRaffleCheckoutInput(body.value);
 if(!parsed.ok)return reply({success:false,error:parsed.error},400);
 const {name,email,phone,quantity}=parsed.value;
 if(!validateEmail(email)||(phone&&!validatePhone(phone))||body.value.cashReceived!==true||typeof body.value.saleKey!=='string'||!saleKeyPattern.test(body.value.saleKey)||!Number.isSafeInteger(body.value.priceCents))return reply({success:false,error:'Enter valid purchaser details and confirm that the exact cash total has been received.'},400);
 const db=createServerClient();
 const {data,error}=await db.rpc('record_member_cash_trailer_sale',{sale_key:body.value.saleKey,actor_id:auth.member.id,buyer_name:name,buyer_email:email,buyer_phone:phone,ticket_quantity:quantity,quoted_price_cents:body.value.priceCents});
 if(error){console.error('[cash-raffle] Sale could not be recorded',{code:error.code});return reply({success:false,error:'Sale not confirmed. Check the purchaser details, raffle availability and current price. Retry the same sale to check its result before starting another.'},409);}
 // Sale persistence is independent of the provider. A failed immediate attempt
 // stays in the durable outbox and must never invite a duplicate cash collection.
 let deliveryStatus='queued';
 try{const queued=await enqueuePaymentReceiptJob(db,'raffle_order',data.orderId);if(queued.ok){const delivery=await attemptPaymentReceiptDelivery(db,queued.jobId);deliveryStatus=delivery.status==='not_claimed'?await deliveryStatusForSale(db,data.orderId):delivery.status;}}catch{ /* The transaction already queued the job. */ }
 return reply({success:true,...data,deliveryStatus});
}

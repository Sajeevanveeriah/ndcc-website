import { NextResponse } from 'next/server';
import { requirePermissionResult } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { readLimitedJsonObject, validateRaffleCheckoutInput } from '@/lib/order-input-validation';
import { validateEmail, validatePhone } from '@/lib/utils';
import { enforceRateLimit } from '@/lib/server/request-guards';
import { enqueuePaymentReceiptJob, attemptPaymentReceiptDelivery } from '@/lib/payments/receipt-delivery';
export const dynamic = 'force-dynamic';
const reply=(body:object,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const saleKeyPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function GET(request:Request){
 const auth=await requirePermissionResult('raffle');if(!auth.user)return reply({success:false,error:auth.error},auth.status);
 const {data,error}=await createServerClient().from('raffle_campaigns').select('name,price_cents,active,draw_at').eq('code','NDCCRAF').single();
 if(error)return reply({success:false,error:'The trailer raffle could not be loaded.'},503);
 const key=new URL(request.url).searchParams.get('sale');
 let sale=null;
 if(key){
  if(!saleKeyPattern.test(key))return reply({success:false,error:'Invalid sale reference.'},400);
  const result=await createServerClient().from('raffle_orders').select('amount_cents,payment_reference,raffle_tickets(ticket_reference,ticket_number)').eq('cash_sale_key',key).eq('cash_received_by',auth.user.id).maybeSingle();
  if(result.error)return reply({success:false,error:'Unable to check the previous sale. Retry before accepting more cash.'},503);
  if(result.data)sale={amountCents:result.data.amount_cents,paymentReference:result.data.payment_reference,ticketReferences:result.data.raffle_tickets.sort((a:{ticket_number:number},b:{ticket_number:number})=>a.ticket_number-b.ticket_number).map((ticket:{ticket_reference:string})=>ticket.ticket_reference),deliveryStatus:'queued'};
 }
 return reply({success:true,campaign:data,sale});
}
export async function POST(request:Request){
 const auth=await requirePermissionResult('raffle');if(!auth.user)return reply({success:false,error:auth.error},auth.status);
 if(!await enforceRateLimit(`raffle-cash:${auth.user.id}`,30,60_000))return reply({success:false,error:'Please wait a minute before recording another sale.'},429);
 const body=await readLimitedJsonObject(request,16*1024);
 if(!body.ok)return reply({success:false,error:body.error},400);
 const parsed=validateRaffleCheckoutInput(body.value);
 if(!parsed.ok)return reply({success:false,error:parsed.error},400);
 const {name,email,phone,quantity}=parsed.value;
 if(!validateEmail(email)||(phone&&!validatePhone(phone))||body.value.cashReceived!==true||typeof body.value.saleKey!=='string'||!saleKeyPattern.test(body.value.saleKey)||!Number.isSafeInteger(body.value.priceCents))return reply({success:false,error:'Enter valid purchaser details and confirm that the exact cash total has been received.'},400);
 const db=createServerClient();
 const {data,error}=await db.rpc('record_cash_trailer_sale',{sale_key:body.value.saleKey,actor_id:auth.user.id,buyer_name:name,buyer_email:email,buyer_phone:phone,ticket_quantity:quantity,quoted_price_cents:body.value.priceCents});
 if(error){console.error('[cash-raffle] Sale could not be recorded',{code:error.code});return reply({success:false,error:'Sale not confirmed. Check the purchaser details, raffle availability and current price. Retry the same sale to check its result before starting another.'},409);}
 // Sale persistence is independent of the provider. A failed immediate attempt
 // stays in the durable outbox and must never invite a duplicate cash collection.
 let deliveryStatus='queued';
 try{const queued=await enqueuePaymentReceiptJob(db,'raffle_order',data.orderId);if(queued.ok){const delivery=await attemptPaymentReceiptDelivery(db,queued.jobId);deliveryStatus=delivery.status;}}catch{ /* The transaction already queued the job. */ }
 return reply({success:true,...data,deliveryStatus});
}

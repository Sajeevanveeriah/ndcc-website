import { NextResponse } from 'next/server';
import { requirePermissionResult } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
export const dynamic = 'force-dynamic';
const reply=(body:object,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(){
 const auth=await requirePermissionResult('raffle');if(!auth.user)return reply({success:false,error:auth.error},auth.status);
 const db=createServerClient();
 // Committee receipts already represent cash received by the club. Only member
 // collections need a separate handover; never count legacy staff receipts as owing.
 const rows=[];
 for(let offset=0;;offset+=1000){
  const {data,error}=await db.from('raffle_orders').select('id,payment_reference,amount_cents,cash_received_at,cash_handed_in_at,member:club_members!cash_received_by_member(full_name),staff:committee_users!cash_received_by(full_name)').eq('payment_method','cash').eq('status','paid').not('cash_received_by_member','is',null).order('created_at',{ascending:false}).order('id').range(offset,offset+999);
  if(error)return reply({success:false,error:'Cash collections could not be loaded.'},503);
  rows.push(...(data||[]));if(!data||data.length<1000)break;
 }
 return reply({success:true,collections:rows});
}
export async function PATCH(request:Request){
 const auth=await requirePermissionResult('raffle');if(!auth.user)return reply({success:false,error:auth.error},auth.status);
 const body=await readLimitedJsonObject(request,4096);
 if(!body.ok||typeof body.value.orderId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.value.orderId)||body.value.cashReceived!==true)return reply({success:false,error:'Confirm that the club has received the cash for this sale.'},400);
 const {data,error}=await createServerClient().from('raffle_orders').update({cash_handed_in_at:new Date().toISOString(),cash_handed_in_by:auth.user.id}).eq('id',body.value.orderId).eq('payment_method','cash').eq('status','paid').not('cash_received_by_member','is',null).is('cash_handed_in_at',null).select('id').maybeSingle();
 if(error)return reply({success:false,error:'The cash handover could not be saved. Refresh and retry.'},503);
 // A retry after success is harmless; no payment amount or ticket is changed.
 if(!data)return reply({success:false,error:'This sale is already reconciled or unavailable. Refresh the list.'},409);
 return reply({success:true});
}

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { FULL_ACCESS_ROLES } from '@/lib/auth/config';
import { createServerClient } from '@/lib/supabase-server';
import { processBalanceReminders } from '@/lib/payments/balance-reminders';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET() {
  if(!await requirePermission('orders',FULL_ACCESS_ROLES)) return NextResponse.json({error:'Forbidden.'},{status:403});
  const {data,error}=await createServerClient().from('apparel_balance_reminders').select('id,order_id,cycle,due_at,status,sent_at,provider_message_id,last_error').order('due_at',{ascending:false}).limit(100);
  return NextResponse.json(error?{error:'Reminder history is unavailable.'}:{data},{status:error?503:200,headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request) {
  if(!await requirePermission('orders',FULL_ACCESS_ROLES)) return NextResponse.json({error:'Forbidden.'},{status:403});
  try{return NextResponse.json(await processBalanceReminders(request));}
  catch(error){console.error('[apparel-reminders]',error);return NextResponse.json({error:'Reminders could not be processed.'},{status:500});}
}

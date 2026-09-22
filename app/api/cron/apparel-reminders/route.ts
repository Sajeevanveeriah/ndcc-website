import { NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { processBalanceReminders } from '@/lib/payments/balance-reminders';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:Request) {
  if(!isAuthorizedCronRequest(request.headers.get('authorization'),process.env.CRON_SECRET)) return NextResponse.json({error:'Unauthorized.'},{status:401});
  try {return NextResponse.json(await processBalanceReminders(request),{headers:{'Cache-Control':'no-store'}});}
  catch(error){console.error('[apparel-reminders]',error);return NextResponse.json({error:'Reminders could not be processed.'},{status:500});}
}

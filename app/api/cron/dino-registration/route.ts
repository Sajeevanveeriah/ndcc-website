import { NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { createServerClient } from '@/lib/supabase-server';
import { processDinoNotifications } from '@/lib/dino-coach/notifications';
import { processDinoFeedback } from '@/lib/dino-coach/feedback-delivery';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:Request) {
  if(!isAuthorizedCronRequest(request.headers.get('authorization'),process.env.CRON_SECRET)) return NextResponse.json({success:false,error:'Unauthorized.'},{status:401});
  try {
    const db=createServerClient(); const deadline=Date.now()+45_000;
    const feedback=await processDinoFeedback(db,Date.now()+10_000).catch(()=>{console.error('[dino-feedback] Retry scan failed.');return {sent:0,retrying:0,failed:true};});
    const queued=await db.rpc('queue_dino_initial_reminders');
    if(queued.error) throw new Error(queued.error.message);
    return NextResponse.json({success:true,queued:queued.data,feedback,...await processDinoNotifications(db,deadline)});
  } catch(error) {return NextResponse.json({success:false,error:error instanceof Error?error.message:'Registration check failed.'},{status:500});}
}

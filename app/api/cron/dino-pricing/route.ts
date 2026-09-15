import { NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { createServerClient } from '@/lib/supabase-server';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:Request) {
 if (!isAuthorizedCronRequest(request.headers.get('authorization'),process.env.CRON_SECRET)) return NextResponse.json({success:false,error:'Unauthorized.'},{status:401});
 try {
 const db=createServerClient();
 const {data:seasons,error}=await db.from('fantasy_seasons').select('id').eq('is_current',true);
 if(error) throw new Error(error.message);
 const results=[];
 for(const season of seasons || []) {const {data,error:failure}=await db.rpc('settle_dino_price_windows',{target_season_id:season.id});if(failure)throw new Error(failure.message);results.push(data);}
 return NextResponse.json({success:true,results});
 } catch(error) {return NextResponse.json({success:false,error:error instanceof Error?error.message:'Pricing failed.'},{status:500});}
}

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { publishDinoCoachInitialPrices, recalculateDinoCoachInitialPrices } from '@/lib/dino-coach/pricing';
export const dynamic='force-dynamic';
export async function POST(request:Request){if(!await requirePermission('fantasy.home'))return NextResponse.json({success:false,error:'Admin sign in is required.'},{status:403});try{const body=await request.json();const {data:season}=await createServerClient().from('fantasy_seasons').select('id').eq('is_current',true).single();if(!season)throw new Error('Current season not found.');const result=body.action==='publish'?await publishDinoCoachInitialPrices(season.id):await recalculateDinoCoachInitialPrices(season.id);return NextResponse.json({success:true,result});}catch(error){return NextResponse.json({success:false,error:error instanceof Error?error.message:'Pricing action failed.'},{status:400});}}

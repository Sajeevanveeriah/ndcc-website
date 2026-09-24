import { NextResponse } from 'next/server';
import { requirePermissionResult } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
import { parseClubMember } from '@/lib/club-members';
export const dynamic = 'force-dynamic';
const reply=(body:object,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:Request){
 const auth=await requirePermissionResult('memberships');if(!auth.user)return reply({success:false,error:auth.error},auth.status);
 const params=new URL(request.url).searchParams; const page=Math.max(0,Math.min(10000,Number(params.get('page'))||0));
 const search=(params.get('search')||'').trim().replace(/[^\p{L}\p{N} @.+-]/gu,'').slice(0,100);
 let query=createServerClient().from('club_member_directory').select('*',{count:'exact'}).order('full_name').order('source').order('id');
 if(search)query=query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
 const {data,error,count}=await query.range(Math.floor(page)*100,Math.floor(page)*100+99);
 if(error)return reply({success:false,error:'Member records could not be loaded.'},503);
 return reply({success:true,records:data,total:count});
}
export async function POST(request:Request){
 const auth=await requirePermissionResult('memberships');if(!auth.user)return reply({success:false,error:auth.error},auth.status);
 const body=await readLimitedJsonObject(request);const input=body.ok?parseClubMember(body.value):null;
 if(!input)return reply({success:false,error:'Enter a name, valid email, optional phone and member type.'},400);
 const {error}=await createServerClient().from('club_members').insert({...input,created_by:auth.user.id});
 if(error)return reply({success:false,error:'The member record could not be added.'},503);
 return reply({success:true});
}

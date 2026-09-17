/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse, after } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { resolveRequestSeason } from '@/lib/fantasy-seasons';
import { getActivePlayersWithLatestPrices } from '@/lib/fantasy-game';
import { getDinoCoachSettings } from '@/lib/dino-coach/server';
import { buildSquadSlots, isAdultOnDate, validateSquadAssignments } from '@/lib/dino-coach/domain';
import { initialSquadStatus } from '@/lib/dino-coach/lifecycle';
import { processDinoNotifications } from '@/lib/dino-coach/notifications';
import { sendRegistrationEmail } from '@/lib/dino-coach/registration-email';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
export const dynamic = 'force-dynamic';
const noStore={'Cache-Control':'no-store',Vary:'Cookie'};
const fail=(error:string,status=400)=>NextResponse.json({success:false,error},{status,headers:noStore});
const managerFields='id,display_name,team_name,email,is_active,team_name_status,team_name_locked,created_at,updated_at,initial_squad_due_at,first_squad_completed_at,hidden_at,deleted_at';
export async function GET(request:Request) {
  const user=await requirePermission('fantasy.home'); if(!user)return fail('Admin session required.',403);
  try {
    const season=await resolveRequestSeason(request); if(!season)return fail('No season available.',404);
    const db=createServerClient(); const id=new URL(request.url).searchParams.get('id');
    if(id) {
      const [manager,entry,squads,players,settings,rounds,events,jobs]=await Promise.all([
        db.from('fantasy_managers').select(managerFields).eq('id',id).single(),
        db.from('fantasy_entries').select('id,status,is_demo,fee_waived,fee_waiver_reason,entry_fee_cents').eq('manager_id',id).eq('season_id',season.id).maybeSingle(),
        db.from('fantasy_squads').select('id,round_id,status,updated_at,budget_used_dino_dollars,fantasy_squad_players(player_id,slot_key,assigned_role,position_type,is_captain,is_vice_captain,purchase_price_dino_dollars,fantasy_players(display_name))').eq('manager_id',id).eq('season_id',season.id).order('created_at',{ascending:false}),
        getActivePlayersWithLatestPrices(season.id),getDinoCoachSettings(season.id),
        db.from('fantasy_rounds').select('id,name').eq('season_id',season.id).order('round_number'),
        db.from('fantasy_admin_events').select('id,action,reason,changes,created_at,actor_id,committee_users(full_name)').eq('manager_id',id).order('created_at',{ascending:false}).limit(30),
        db.from('fantasy_notification_jobs').select('id,kind,created_at,sent_at,cancelled_at,last_error,attempts').eq('manager_id',id).order('created_at',{ascending:false}).limit(30),
      ]);
      for(const r of [manager,entry,squads,rounds,events,jobs])if(r.error)throw new Error(r.error.message);
      return NextResponse.json({success:true,season,manager:manager.data,entry:entry.data,squads:squads.data,players,slots:buildSquadSlots(settings.slot_counts),budget:settings.budget_dino_dollars,rounds:rounds.data,events:events.data,notifications:jobs.data,isAdmin:user.role==='admin'},{headers:noStore});
    }
    const [managers,entries,squads]=await Promise.all([
      db.from('fantasy_managers').select(managerFields).order('created_at',{ascending:false}),
      db.from('fantasy_entries').select('manager_id,status,is_demo,fee_waived').eq('season_id',season.id),
      db.from('fantasy_squads').select('id,manager_id,status,budget_used_dino_dollars,created_at,fantasy_squad_players(player_id)').eq('season_id',season.id).order('created_at',{ascending:false}),
    ]);
    for(const r of [managers,entries,squads])if(r.error)throw new Error(r.error.message);
    const rows=(managers.data||[]).filter(m=>entries.data?.some(e=>e.manager_id===m.id)).map(m=>({...m,initialStatus:initialSquadStatus(m),entry:entries.data?.find(e=>e.manager_id===m.id),squad:squads.data?.find(s=>s.manager_id===m.id)||null}));
    return NextResponse.json({success:true,season,managers:rows,isAdmin:user.role==='admin'},{headers:noStore});
  } catch(error){return fail(error instanceof Error?error.message:'Could not load managers.',500);}
}
export async function PATCH(request:Request) {
  const user=await requirePermission('fantasy.home'); if(!user)return fail('Admin session required.',403);
  const parsed=await readLimitedJsonObject(request,32*1024); if(!parsed.ok)return fail(parsed.error);
  const body=parsed.value as any;
  if(!body.id||!body.expectedUpdatedAt||typeof body.reason!=='string'||!body.reason.trim())return fail('Manager, current version and reason are required.');
  if(!body.changes||typeof body.changes!=='object'||Array.isArray(body.changes))return fail('Invalid changes.');
  for(const key of ['deleted','hidden','fee_waived','is_active','team_name_locked','reactivate'])if(key in body.changes&&typeof body.changes[key]!=='boolean')return fail(`${key} must be true or false.`);
  if(user.role!=='admin'&&('deleted' in body.changes||'fee_waived' in body.changes))return fail('Only the administrator can delete teams or waive fees.',403);
  if(body.changes.deleted===true && body.confirmation!=='DELETE TEAM')return fail('Type DELETE TEAM to confirm.');
  try {
    const season=await resolveRequestSeason(request,body);if(!season)return fail('No season available.',404);
    const db=createServerClient({actorId:user.id});let selection=null;let budget=0;
    if(body.selection!==undefined) {
      if(!Array.isArray(body.selection)||body.selection.length>15)return fail('Choose at most 15 players.');
      const [settings,players]=await Promise.all([getDinoCoachSettings(season.id),getActivePlayersWithLatestPrices(season.id)]);
      const prices=new Map(players.map(p=>[p.id,p.price_dino_dollars]));
      if(body.selection.some((p:any)=>!prices.has(p.playerId)))return fail('A selected player is no longer eligible.');
      const picks=body.selection.map((p:any)=>({...p,purchasePriceDinoDollars:prices.get(p.playerId)}));
      const validation=validateSquadAssignments(picks,buildSquadSlots(settings.slot_counts),settings.budget_dino_dollars,{allowIncomplete:body.status==='draft'});
      if(!validation.valid)return fail(validation.errors.join(' '));
      budget=validation.budgetUsedDinoDollars;
      selection=picks.map((p:any)=>({player_id:p.playerId,slot_key:p.slotKey,assigned_role:p.assignedRole,position_type:p.positionType,is_captain:p.isCaptain===true,is_vice_captain:p.isViceCaptain===true}));
    }
    const result=await db.rpc('admin_edit_dino_manager',{p_manager:body.id,p_season:season.id,p_actor:user.id,p_expected_updated_at:body.expectedUpdatedAt,p_changes:body.changes,p_selection:selection,p_round:body.roundId||null,p_status:body.status||'draft',p_budget:budget,p_reason:body.reason.trim()});
    if(result.error)return fail(result.error.message,result.error.code==='40001'?409:400);
    after(()=>processDinoNotifications(db).catch(error=>console.error('[dino-notification] Pending retry:',error.message)));
    return NextResponse.json({success:true,result:result.data,notification:result.data?.changed?'queued':'not_needed'},{headers:noStore});
  }catch(error){return fail(error instanceof Error?error.message:'Could not save team.');}
}
export async function POST(request:Request) {
  const user=await requirePermission('fantasy.home');if(user?.role!=='admin')return fail('Administrator access required.',403);
  const parsed=await readLimitedJsonObject(request,8*1024);if(!parsed.ok)return fail(parsed.error);
  const body=parsed.value as any;const email=String(body.email||'').trim().toLowerCase();
  if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)||typeof body.password!=='string'||body.password.length<12||body.password.length>128)return fail('Enter a valid email and a password of 12 to 128 characters.');
  if(body.rulesAccepted!==true)return fail('Confirm the participant has agreed to the current rules.');
  if(['displayName','teamName','reason'].some(key=>typeof body[key]!=='string'||!body[key].trim()))return fail('Name, team name and waiver reason are required.');
  const db=createServerClient({actorId:user.id});let createdUserId:string|null=null;
  try {
    const season=await resolveRequestSeason(request,body);if(!season)return fail('No season available.',404);
    const settings=await getDinoCoachSettings(season.id);
    if(typeof body.dateOfBirth!=='string'||!isAdultOnDate(body.dateOfBirth,new Date().toLocaleDateString('en-CA',{timeZone:'Australia/Melbourne'}),settings.minimum_age))return fail(`The participant must be at least ${settings.minimum_age}.`);
    const created=await db.auth.admin.createUser({email,password:body.password,email_confirm:true,user_metadata:{display_name:body.displayName,team_name:body.teamName}});
    if(created.error||!created.data.user)return fail(created.error?.message||'Could not create account.');
    createdUserId=created.data.user.id;
    const result=await db.rpc('admin_register_dino_manager',{p_user:createdUserId,p_actor:user.id,p_season:season.id,p_email:email,p_name:body.displayName,p_team:body.teamName,p_dob:body.dateOfBirth,p_reason:body.reason});
    if(result.error)throw new Error(result.error.message);
    createdUserId=null; // Account and registration committed. Never roll back an existing participant.
    const entry=await db.from('fantasy_entries').select('id').eq('manager_id',result.data).eq('season_id',season.id).single();
    if(entry.data)after(()=>sendRegistrationEmail(db,entry.data!.id).catch(error=>console.error('[dino-welcome]',error.message)));
    return NextResponse.json({success:true,id:result.data,notification:'queued'},{headers:noStore});
  }catch(error){
    if(createdUserId){const removed=await db.auth.admin.deleteUser(createdUserId);if(removed.error)return fail('Registration failed and the new sign-in account needs administrator cleanup. No password was retained by the CMS.',500);}
    return fail(error instanceof Error?error.message:'Could not create registration.');
  }
}

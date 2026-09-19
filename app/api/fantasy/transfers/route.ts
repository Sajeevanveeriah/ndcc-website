import { NextResponse } from 'next/server';
import { resolveFantasyManagerAuth } from '@/lib/fantasy-manager-auth';
import { createServerClient } from '@/lib/supabase-server';
import { getActivePlayersWithLatestPrices, getRoundLockState } from '@/lib/fantasy-game';
import { getDinoCoachSettings, toPublicDinoCoachSettings } from '@/lib/dino-coach/server';
import { buildSquadSlots, isTransferWindowOpen } from '@/lib/dino-coach/domain';
import { resolveRequestSeason, seasonAllowsTeamChanges } from '@/lib/fantasy-seasons';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
 const {auth,errorMessage,errorStatus}=await resolveFantasyManagerAuth(request);
 if(!auth) return NextResponse.json({error:errorMessage},{status:errorStatus});
 try {
  const season=await resolveRequestSeason(request);
  if(!season) return NextResponse.json({error:'No Dino Coach season is available.'},{status:404});
  const db=createServerClient();
  const [settings,players,lock,squads,offers]=await Promise.all([
   getDinoCoachSettings(season.id),getActivePlayersWithLatestPrices(season.id),getRoundLockState(season.id),
   db.from('fantasy_squads').select('id,manager_id,status,updated_at,budget_used_dino_dollars,fantasy_managers!inner(team_name,is_active,deleted_at),fantasy_squad_players(player_id,slot_key,assigned_role,position_type,purchase_price_dino_dollars,fantasy_players(display_name))').eq('season_id',season.id).eq('fantasy_managers.is_active',true).is('fantasy_managers.deleted_at',null).order('created_at',{ascending:false}),
   db.from('fantasy_trade_offers').select('id,proposer_id,recipient_id,offered_player_id,requested_player_id,offered_price,requested_price,status,expires_at,created_at').eq('season_id',season.id).or(`proposer_id.eq.${auth.manager.id},recipient_id.eq.${auth.manager.id}`).order('created_at',{ascending:false}).limit(100),
  ]);
  if(squads.error||offers.error) throw new Error(squads.error?.message||offers.error?.message);
  const latest=[...new Map((squads.data||[]).slice().reverse().map(s=>[s.manager_id,s])).values()];
  const own=latest.find(s=>s.manager_id===auth.manager.id)||null;
  const teams=latest.filter(s=>s.manager_id!==auth.manager.id && s.status==='submitted').map(s=>({managerId:s.manager_id,teamName:(Array.isArray(s.fantasy_managers)?s.fantasy_managers[0]:s.fantasy_managers)?.team_name,players:s.fantasy_squad_players.map(p=>({playerId:p.player_id,displayName:(Array.isArray(p.fantasy_players)?p.fantasy_players[0]:p.fantasy_players)?.display_name}))}));
  const windowOpen=seasonAllowsTeamChanges(season)&&!lock.locked&&settings.public_launch_enabled&&settings.team_selection_open&&isTransferWindowOpen(new Date(),{timezone:settings.transfer_timezone,openWeekday:settings.transfer_open_weekday,openMinute:settings.transfer_open_minute,closeWeekday:settings.transfer_close_weekday,closeMinute:settings.transfer_close_minute});
  return NextResponse.json({success:true,managerId:auth.manager.id,season,settings:toPublicDinoCoachSettings(settings),slots:buildSquadSlots(settings.slot_counts),players,squad:own,teams,offers:offers.data,windowOpen},{headers:{'Cache-Control':'no-store'}});
 } catch(e) { return NextResponse.json({error:e instanceof Error?e.message:'Could not load the market.'},{status:500}); }
}
export async function POST(request: Request) {
 const {auth,errorMessage,errorStatus}=await resolveFantasyManagerAuth(request);
 if(!auth) return NextResponse.json({error:errorMessage},{status:errorStatus});
 try {
  const body=await request.json(); const season=await resolveRequestSeason(request,body);
  if(!season||!seasonAllowsTeamChanges(season)) return NextResponse.json({error:'Team changes are closed.'},{status:403});
  const action=typeof body.action==='string'?body.action:'swap';
  if(!['buy','sell','swap','propose','accept','decline','cancel'].includes(action)) return NextResponse.json({error:'Unknown market action.'},{status:400});
  const lock=await getRoundLockState(season.id);
  if(lock.locked&&!['decline','cancel'].includes(action)) return NextResponse.json({error:lock.reason},{status:403});
  const nullable=(v:unknown)=>typeof v==='string'&&v?v:null;
  const db=createServerClient();
  const result=['buy','sell','swap'].includes(action)
   ? await db.rpc('dino_market_action',{mid:auth.manager.id,sid:season.id,rid:lock.roundId,action,out_id:nullable(body.playerOutId),in_id:nullable(body.playerInId),slot:nullable(body.slotKey),expected_updated_at:nullable(body.expectedUpdatedAt),expected_price:Number.isSafeInteger(body.expectedPrice)?body.expectedPrice:null})
   : await db.rpc('dino_trade_action',{mid:auth.manager.id,sid:season.id,rid:lock.roundId,action,offer_id:nullable(body.offerId),other_id:nullable(body.otherManagerId),out_id:nullable(body.playerOutId),in_id:nullable(body.playerInId)});
  if(result.error) return NextResponse.json({error:result.error.message},{status:400});
  return NextResponse.json({success:true,id:result.data});
 } catch(e) { return NextResponse.json({error:e instanceof Error?e.message:'Could not save the market action.'},{status:400}); }
}

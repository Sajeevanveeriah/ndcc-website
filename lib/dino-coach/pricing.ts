/* eslint-disable @typescript-eslint/no-explicit-any */
import 'server-only';
import { createServerClient } from '@/lib/supabase-server';
import { calculateBasePerformancePoints, calculateInitialPrice } from './domain';
import { getDinoCoachSettings, getDinoReleaseReadiness } from './server';

const FINAL_STATUSES = ['verified_playhq','verified_no_prior_appearance','international_manual','international_premium'];

async function recalculateFromAppliedBaseline(supabase:any, seasonId:string, batch:{id:string}) {
  const { data, error } = await supabase.rpc('recalculate_dino_coach_applied_baseline', { target_season_id: seasonId });
  if (error) throw new Error(error.message);
  return { ...(data || {}), seasonId, baselineImportId: batch.id, formulaVersion: 'dino-baseline-import-v1' };
}

export async function recalculateDinoCoachInitialPrices(seasonId: string) {
  const supabase = createServerClient();
  const [{ data: season, error: seasonError }, settings] = await Promise.all([
    supabase.from('fantasy_seasons').select('id,start_date').eq('id', seasonId).single(), getDinoCoachSettings(seasonId),
  ]);
  if (seasonError || !season) throw new Error(seasonError?.message || 'Dino Coach season not found.');
  const {data:appliedBaseline,error:baselineError}=await supabase.from('fantasy_baseline_import_batches').select('id').eq('target_season_id',seasonId).eq('status','applied').order('applied_at',{ascending:false}).limit(1).maybeSingle();
  if(baselineError)throw new Error(baselineError.message);
  if(appliedBaseline)return recalculateFromAppliedBaseline(supabase,seasonId,appliedBaseline);
  const { data: prior } = await supabase.from('fantasy_seasons').select('id,name').lt('start_date', season.start_date).neq('slug','legacy-unverified').order('start_date',{ascending:false}).limit(1).maybeSingle();
  if (!prior) throw new Error('No prior regular season is configured for initial pricing.');
  const { data: completedJobs } = await supabase.from('fantasy_sync_jobs').select('id,status,review_items,error_summary,import_batch_id').eq('season_id', prior.id).eq('status','completed').order('created_at',{ascending:false}).limit(1);
  const job = completedJobs?.[0];
  if (!job || (job.review_items || []).length || (job.error_summary || []).length) throw new Error('Prior-season PlayHQ sync is not complete and review-free. Prices were not recalculated.');
  const { data: batch } = await supabase.from('fantasy_import_batches').select('id,status').eq('id',job.import_batch_id).eq('status','published').maybeSingle();
  if (!batch) throw new Error('Prior-season PlayHQ import batch is not published. Prices were not recalculated.');

  const [{ data: roster, error: rosterError }, { data: stats, error: statError }] = await Promise.all([
    supabase.from('fantasy_season_players').select('player_id,fantasy_players(display_name,playhq_player_id,is_international)').eq('season_id',seasonId).eq('active',true).eq('selectable',true),
    supabase.from('fantasy_match_stats').select('player_id,playhq_game_id,runs,wickets,maidens,catches,runouts,stumpings,not_out,fantasy_rounds(pricing_eligible),fantasy_import_batches(status)').eq('season_id',prior.id).eq('import_batch_id',batch.id),
  ]);
  if (rosterError || statError) throw new Error(rosterError?.message || statError?.message);
  const totals = new Map<string,{points:number;games:Set<string>}>();
  for (const row of stats || []) {
    const typed=row as any;
    const batchRelation=Array.isArray(typed.fantasy_import_batches)?typed.fantasy_import_batches[0]:typed.fantasy_import_batches;
    const roundRelation=Array.isArray(typed.fantasy_rounds)?typed.fantasy_rounds[0]:typed.fantasy_rounds;
    if (batchRelation?.status!=='published' || roundRelation?.pricing_eligible===false || !typed.playhq_game_id) continue;
    const item=totals.get(typed.player_id)||{points:0,games:new Set<string>()}; item.points+=calculateBasePerformancePoints(typed,settings.scoring_config); item.games.add(typed.playhq_game_id); totals.set(typed.player_id,item);
  }
  const averages=(roster||[]).map((row:any)=>{const history=totals.get(row.player_id);const appearances=history?.games.size||0;return {row,appearances,average:appearances?Number((history!.points/appearances).toFixed(4)):0};});
  const best=Math.max(0,...averages.filter((item:any)=>!item.row.fantasy_players?.is_international).map((item:any)=>item.average));
  if (best<=0) throw new Error('Published prior-season data produced no verified domestic appearance baseline.');
  const calculated = averages.map((item:any) => {
    const international=Boolean(item.row.fantasy_players?.is_international); const linked=Boolean(item.row.fantasy_players?.playhq_player_id);
    const status=international?(item.appearances?'international_manual':'international_premium'):(item.appearances?'verified_playhq':'verified_no_prior_appearance');
    if (!international && !linked && item.appearances) throw new Error(`Player ${item.row.fantasy_players?.display_name} has statistics without a stable source link.`);
    const baseline=international&&!item.appearances?best:item.average;
    const price=calculateInitialPrice(baseline,best,settings.initial_price_floor_dino_dollars,settings.initial_price_ceiling_dino_dollars);
    const evidence={prior_season_id:prior.id,import_batch_id:batch.id,appearances:item.appearances,role_neutral_points:item.appearances?Number((item.average*item.appearances).toFixed(4)):0,best_domestic_average:best,source_status:status,international_premium_fallback:international&&!item.appearances};
    return { player_id:item.row.player_id, stats_status:status, appearances:item.appearances, baseline_points:baseline,
      international_baseline_points:international?baseline:null, price_dino_dollars:price, evidence };
  });
  const prices=calculated.map((item:any)=>item.price_dino_dollars).sort((a:number,b:number)=>b-a);
  const top15=prices.slice(0,15).reduce((a:number,b:number)=>a+b,0); const affordable=prices.slice(-15).reduce((a:number,b:number)=>a+b,0);
  if(top15<=settings.budget_dino_dollars||affordable>settings.budget_dino_dollars) throw new Error(`Economy calibration failed: top 15 ${top15}, cheapest 15 ${affordable}, budget ${settings.budget_dino_dollars}.`);
  const applied=await supabase.rpc('apply_dino_coach_initial_price_recalculation',{target_season_id:seasonId,calculated_players:calculated});
  if(applied.error)throw new Error(applied.error.message);
  return {seasonId,priorSeasonId:prior.id,players:averages.length,bestDomesticAverage:best,top15Cost:top15,cheapest15Cost:affordable,budget:settings.budget_dino_dollars,statuses:Object.fromEntries(FINAL_STATUSES.map((status)=>[status,averages.filter((item:any)=>status===(item.row.fantasy_players?.is_international?(item.appearances?'international_manual':'international_premium'):(item.appearances?'verified_playhq':'verified_no_prior_appearance'))).length]))};
}

export async function publishDinoCoachInitialPrices(seasonId:string){
  const supabase=createServerClient(); const readiness=await getDinoReleaseReadiness(seasonId);
  if(!readiness||readiness.resolved_players!==readiness.selectable_players||readiness.ambiguous_identities>0||readiness.duplicate_source_links>0) throw new Error('Player identity reconciliation is incomplete. Prices were not published.');
  const {error}=await supabase.rpc('publish_dino_coach_initial_prices',{target_season_id:seasonId});
  if(error)throw new Error(error.message);
  return getDinoReleaseReadiness(seasonId);
}

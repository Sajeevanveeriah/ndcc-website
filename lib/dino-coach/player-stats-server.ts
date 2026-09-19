import 'server-only';
import { createServerClient } from '@/lib/supabase-server';
import { historicalPlayerStats, type PlayerStats } from './player-stats';
export async function getPlayerStats(seasonId: string,players: Array<{id:string;display_name:string}>) {
 const db=createServerClient();
 const {data:stats,error}=await db.from('fantasy_match_stats').select('player_id,runs,wickets,catches,stumpings,runouts,maidens,fantasy_import_batches!inner(status,season_id)').eq('fantasy_import_batches.status','published').eq('fantasy_import_batches.season_id',seasonId);
 if(error) throw new Error(error.message);
 const result=new Map<string,PlayerStats|null>();
 for(const player of players) {
  const rows=(stats||[]).filter(r=>r.player_id===player.id);
  if(!rows.length) {result.set(player.id,historicalPlayerStats(player.id,player.display_name,seasonId));continue;}
  const sum=(key:'runs'|'wickets'|'catches'|'stumpings'|'runouts'|'maidens')=>rows.every(r=>r[key]!==null)?rows.reduce((n,r)=>n+Number(r[key]),0):null;
  result.set(player.id,{period:'Selected season',source:'Published Dino Coach match records',matches:rows.length,runs:sum('runs'),wickets:sum('wickets'),catches:sum('catches'),stumpings:sum('stumpings'),runouts:sum('runouts'),maidens:sum('maidens')});
 }
 return result;
}

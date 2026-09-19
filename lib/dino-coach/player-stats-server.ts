import 'server-only';
import { createServerClient } from '@/lib/supabase-server';
import { historicalPlayerStats, type PlayerStats } from './player-stats';
export async function getPlayerStats(seasonId: string,players: Array<{id:string;display_name:string}>) {
 const db=createServerClient();
 type RecordRow = {player_id:string;runs:number|null;wickets:number|null;catches:number|null;stumpings:number|null;runouts:number|null;maidens:number|null};
 const stats:RecordRow[]=[];
 for(let offset=0;;offset+=1000) {
  const {data,error}=await db.from('fantasy_match_stats').select('id,player_id,runs,wickets,catches,stumpings,runouts,maidens,fantasy_import_batches!inner(status,season_id)').eq('fantasy_import_batches.status','published').eq('fantasy_import_batches.season_id',seasonId).order('id').range(offset,offset+999);
  if(error) throw new Error(error.message);
  stats.push(...(data||[]));
  if(!data || data.length<1000) break;
 }
 const result=new Map<string,PlayerStats|null>();
 for(const player of players) {
  const rows=(stats||[]).filter(r=>r.player_id===player.id);
  if(!rows.length) {result.set(player.id,historicalPlayerStats(player.id,player.display_name,seasonId));continue;}
  const sum=(key:'runs'|'wickets'|'catches'|'stumpings'|'runouts'|'maidens')=>rows.every(r=>r[key]!==null)?rows.reduce((n,r)=>n+Number(r[key]),0):null;
  result.set(player.id,{period:'Selected season',source:'Published Dino Coach match records',matches:rows.length,runs:sum('runs'),wickets:sum('wickets'),catches:sum('catches'),stumpings:sum('stumpings'),runouts:sum('runouts'),maidens:sum('maidens')});
 }
 return result;
}

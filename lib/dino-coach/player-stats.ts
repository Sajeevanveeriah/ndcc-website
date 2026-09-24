import summary from '@/data/dino-coach-2025-26-summary.json';
import researched from '@/data/dino-coach-researched-baselines-20260924.json';
import external from '@/data/dino-coach-external-baselines-20260916.json';
import { normalisePlayerIdentity } from './domain';

export type PlayerStats = { period: string; source: string; matches: number | null; runs: number | null; wickets: number | null; catches: number | null; stumpings: number | null; runouts: number | null; maidens: number | null };
export function historicalPlayerStats(playerId: string, name: string, seasonId: string): PlayerStats | null {
 if(seasonId!==external.seasonId) return null;
 const latest=researched.players.find(p=>p.playerId===playerId);
 if(latest)return {period:latest.season,source:latest.scope,matches:latest.matches,runs:latest.runs,wickets:latest.wickets,catches:latest.catches,stumpings:latest.stumpings,runouts:latest.runouts,maidens:latest.maidens};
 const abroad=external.players.find(p=>p.playerId===playerId);
 if(abroad) return {period:abroad.season||'Historical season unavailable',source:abroad.scope||'External season record',matches:abroad.matches,runs:abroad.runs,wickets:abroad.wickets,catches:abroad.catches,stumpings:abroad.stumpings,runouts:null,maidens:null};
 const aliases=summary.aliases as Record<string,string>;
 const rows=summary.rows.filter(row=>!/^U\d/i.test(row.grade)&&normalisePlayerIdentity(aliases[row.name]||row.name)===normalisePlayerIdentity(name));
 if(!rows.length) return null;
 const total=(key:'runs'|'wickets'|'catches'|'stumpings'|'matches')=>rows.every(r=>r[key]!==null)?rows.reduce((n,r)=>n+Number(r[key]),0):null;
 return {period:summary.sourceSeason,source:'Club season summary - senior grades',matches:total('matches'),runs:total('runs'),wickets:total('wickets'),catches:total('catches'),stumpings:total('stumpings'),runouts:null,maidens:null};
}

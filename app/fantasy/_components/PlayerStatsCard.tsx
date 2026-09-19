import { CRICKET_ROLE_LABELS } from '@/lib/dino-coach/season-summary';
import type { PlayerStats } from '@/lib/dino-coach/player-stats';
export default function PlayerStatsCard({player}:{player:{display_name:string;role:string;price_dino_dollars:number;stats?:PlayerStats|null}}) {
 const s=player.stats;
 const value=(n:number|null|undefined)=>n==null?'Not recorded':n.toLocaleString('en-AU');
 return <article aria-label={`${player.display_name} player card`} className="rounded-xl border border-maroon-200 p-5 bg-surface-card shadow-sm">
  <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">{CRICKET_ROLE_LABELS[player.role]||player.role}</p>
  <h3 className="mt-1 text-xl font-display font-bold">{player.display_name}</h3>
  <p className="mt-1 font-semibold">{player.price_dino_dollars.toLocaleString('en-AU')} Dino Dollars</p>
  <div className="mt-4 grid grid-cols-3 gap-3 border-y py-4 text-center"><div><p className="text-xs font-semibold">BATTING</p><p className="mt-1 font-bold">{value(s?.runs)}</p><p className="text-xs">Runs</p></div><div><p className="text-xs font-semibold">BOWLING</p><p className="mt-1 font-bold">{value(s?.wickets)}</p><p className="text-xs">Wickets</p></div><div><p className="text-xs font-semibold">FIELDING</p><p className="mt-1 font-bold">{value(s?.catches)}</p><p className="text-xs">Catches</p></div></div>
  {s?<><dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><div><dt>Match records</dt><dd>{value(s.matches)}</dd></div><div><dt>Stumpings</dt><dd>{value(s.stumpings)}</dd></div><div><dt>Run-outs</dt><dd>{value(s.runouts)}</dd></div><div><dt>Maidens</dt><dd>{value(s.maidens)}</dd></div></dl><p className="mt-3 text-xs text-content-muted">{s.period} | {s.source}</p></>:<p className="mt-3 text-sm">Statistics not yet recorded.</p>}
 </article>;
}

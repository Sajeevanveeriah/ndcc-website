/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import { fantasyJsonFetch } from '@/lib/fantasy-browser';
import { formatDinoDollars as money } from '@/lib/dino-coach/domain';
import { useSeasonParam } from './useSeasonParam';
import WalletPanel from './WalletPanel';
import { marketPreview } from '@/lib/dino-coach/wallet';

export default function TransfersClient() {
 const {query}=useSeasonParam();
 const [data,setData]=useState<any>(null); const [out,setOut]=useState(''); const [incoming,setIncoming]=useState('');
 const [slot,setSlot]=useState('');
 const [error,setError]=useState(''); const [feedback,setFeedback]=useState(''); const [busy,setBusy]=useState(false);
 const load=useCallback(async()=>{try {setData(await fantasyJsonFetch<any>(`/api/fantasy/transfers${query}`));setError('');}catch(e){setError(e instanceof Error?e.message:'Market unavailable');}},[query]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==='visible') void load();},15000);return ()=>clearInterval(timer);},[load]);
 const act=async(action:string,extra:Record<string,unknown>={})=>{
  if(busy) return; setBusy(true);setError('');setFeedback('');
  try { await fantasyJsonFetch(`/api/fantasy/transfers${query}`,{method:'POST',body:JSON.stringify({action,playerOutId:out,playerInId:incoming,slotKey:slot,expectedUpdatedAt:data?.squad?.updated_at,expectedPrice:Number(data?.players.find((p:any)=>p.id===incoming)?.price_dino_dollars||0),...extra})});
   setFeedback(action==='sell'?'Player sold. Fill the empty slot and submit your squad before the deadline.':action==='buy'?'Player bought. Check leadership and submit your complete squad.':'Changes saved.');
   setOut('');setIncoming('');setSlot(''); await load();
  }catch(e){setError(e instanceof Error?e.message:'Action failed');}finally{setBusy(false);}
 };
 if(!data) return <div className="card p-6"><p role="status">{error||'Loading the player market...'}</p>{error&&<><Button onClick={()=>void load()}>Retry</Button><Link href="/fantasy/login">Sign in</Link></>}</div>;
 const picks=data.squad?.fantasy_squad_players||[]; const owned=new Set(picks.map((p:any)=>p.player_id));
 const refund=Number(picks.find((p:any)=>p.player_id===out)?.purchase_price_dino_dollars||0);
 const cost=Number(data.players.find((p:any)=>p.id===incoming)?.price_dino_dollars||0);
 const remaining=Number(data.settings.budget_dino_dollars)-Number(data.squad?.budget_used_dino_dollars||0);
 const empty=data.slots.filter((s:any)=>!picks.some((p:any)=>p.slot_key===s.key));
 const closed=!data.windowOpen||busy;
 const weekdays=['','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
 const clock=(minute:number)=>`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
 return <div className="space-y-6">
  <WalletPanel query={query} refreshKey={data.squad?.updated_at} onExternalChange={()=>void load()}/>
  <p role="status">{data.windowOpen?'The transfer window is open.':'The transfer window is closed.'} {weekdays[data.settings.transfer_open_weekday]} {clock(data.settings.transfer_open_minute)} to before {weekdays[data.settings.transfer_close_weekday]} {clock(data.settings.transfer_close_minute)}, {data.settings.transfer_timezone==='Australia/Melbourne'?'Melbourne':data.settings.transfer_timezone} time. Round locks also apply.</p>
  <p>Players are bought from and sold back to the shared player pool. Sales refund the original purchase cost shown below. Purchases use the current published price. Player market value is separate from available money. All transactions use virtual Dino Dollars.</p>
  <section className="card p-5 space-y-4"><h2 className="text-xl font-display font-bold">Buy, sell or replace a player</h2>
   {!data.squad&&<p><Link className="underline" href={`/fantasy/squad${query}`}>Build your first squad</Link> to use the market.</p>}
   <div className="grid gap-4 md:grid-cols-2">
    <label>Player to sell<select className="form-input mt-1 w-full" value={out} onChange={e=>setOut(e.target.value)}><option value="">Choose a player</option>{picks.map((p:any)=><option key={p.player_id} value={p.player_id}>{p.fantasy_players?.display_name} - refund {money(Number(p.purchase_price_dino_dollars))}</option>)}</select></label>
    <label>Player to buy<select className="form-input mt-1 w-full" value={incoming} onChange={e=>setIncoming(e.target.value)}><option value="">Choose a player</option>{data.players.filter((p:any)=>!owned.has(p.id)&&p.published_at).map((p:any)=><option key={p.id} value={p.id}>{p.display_name} - {money(p.price_dino_dollars)}</option>)}</select></label>
   </div>
   <p aria-live="polite">Sale refund: {money(refund)}. Purchase: {money(cost)}. After replacement: {money(marketPreview(remaining,refund,cost))}.</p>
   <div className="flex flex-wrap gap-3"><Button variant="secondary" disabled={closed||!out} onClick={()=>void act('sell')}>Sell back to pool</Button><Button disabled={closed||!out||!incoming||remaining+refund<cost} onClick={()=>void act('swap')}>Sell and buy replacement</Button></div>
   {empty.length>0&&<><label>Empty slot<select className="form-input mt-1 w-full" value={slot} onChange={e=>setSlot(e.target.value)}><option value="">Choose a slot</option>{empty.map((s:any)=><option key={s.key} value={s.key}>{s.label}</option>)}</select></label><Button disabled={closed||!slot||!incoming||remaining<cost} onClick={()=>void act('buy')}>Buy into empty slot</Button></>}
   <p><Link href={`/fantasy/squad${query}`} className="underline">Open My squad</Link> to set leadership and submit after individual sales or purchases. An incomplete draft cannot be submitted.</p>
  </section>
  <div aria-live="polite">{error&&<p role="alert" className="text-red-700">{error}</p>}{feedback&&<p>{feedback}</p>}</div>
 </div>;
}

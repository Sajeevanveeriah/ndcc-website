/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import { fantasyJsonFetch, fantasyBrowserClient } from '@/lib/fantasy-browser';
import { formatDinoDollars as money } from '@/lib/dino-coach/domain';
import { useSeasonParam } from './useSeasonParam';
import WalletPanel from './WalletPanel';
import { marketPreview } from '@/lib/dino-coach/wallet';

export default function TransfersClient() {
 const {query}=useSeasonParam();
 const [data,setData]=useState<any>(null); const [out,setOut]=useState(''); const [incoming,setIncoming]=useState('');
 const [slot,setSlot]=useState(''); const [team,setTeam]=useState(''); const [requested,setRequested]=useState('');
 const [error,setError]=useState(''); const [feedback,setFeedback]=useState(''); const [busy,setBusy]=useState(false);
 const load=useCallback(async()=>{try {setData(await fantasyJsonFetch<any>(`/api/fantasy/transfers${query}`));setError('');}catch(e){setError(e instanceof Error?e.message:'Market unavailable');}},[query]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{
  if(!data?.managerId||!fantasyBrowserClient) return;
  const client=fantasyBrowserClient;
  const channel=client.channel(`trades-${data.managerId}-${query}`)
   .on('postgres_changes',{event:'*',schema:'public',table:'fantasy_trade_offers',filter:`proposer_id=eq.${data.managerId}`},()=>void load())
   .on('postgres_changes',{event:'*',schema:'public',table:'fantasy_trade_offers',filter:`recipient_id=eq.${data.managerId}`},()=>void load()).subscribe();
  const timer=setInterval(()=>{if(document.visibilityState==='visible') void load();},15000);
  return ()=>{clearInterval(timer);void client.removeChannel(channel);};
 },[data?.managerId,load,query]);
 const act=async(action:string,extra:Record<string,unknown>={})=>{
  if(busy) return; setBusy(true);setError('');setFeedback('');
  try { await fantasyJsonFetch(`/api/fantasy/transfers${query}`,{method:'POST',body:JSON.stringify({action,playerOutId:out,playerInId:incoming,slotKey:slot,otherManagerId:team,expectedUpdatedAt:data?.squad?.updated_at,expectedPrice:Number(data?.players.find((p:any)=>p.id===incoming)?.price_dino_dollars||0),...extra})});
   setFeedback(action==='sell'?'Player sold. Fill the empty slot and submit your squad before the deadline.':action==='buy'?'Player bought. Check leadership and submit your complete squad.':action==='propose'?'Trade offer sent. Nothing changes until the other manager accepts.':'Changes saved.');
   setOut('');setIncoming('');setRequested('');setSlot(''); await load();
  }catch(e){setError(e instanceof Error?e.message:'Action failed');}finally{setBusy(false);}
 };
 if(!data) return <div className="card p-6"><p role="status">{error||'Loading the player market...'}</p>{error&&<><Button onClick={()=>void load()}>Retry</Button><Link href="/fantasy/login">Sign in</Link></>}</div>;
 const picks=data.squad?.fantasy_squad_players||[]; const owned=new Set(picks.map((p:any)=>p.player_id));
 const refund=Number(picks.find((p:any)=>p.player_id===out)?.purchase_price_dino_dollars||0);
 const cost=Number(data.players.find((p:any)=>p.id===incoming)?.price_dino_dollars||0);
 const remaining=Number(data.settings.budget_dino_dollars)-Number(data.squad?.budget_used_dino_dollars||0);
 const empty=data.slots.filter((s:any)=>!picks.some((p:any)=>p.slot_key===s.key));
 const other=data.teams.find((t:any)=>t.managerId===team);
 const name=(id:string)=>data.players.find((p:any)=>p.id===id)?.display_name||'Player no longer selectable';
 const teamName=(id:string)=>id===data.managerId?'Your team':data.teams.find((t:any)=>t.managerId===id)?.teamName||'Other team';
 const closed=!data.windowOpen||busy;
 return <div className="space-y-6">
  <WalletPanel query={query} refreshKey={data.squad?.updated_at} onExternalChange={()=>void load()}/>
  <p role="status">{data.windowOpen?'The transfer window is open.':'The transfer window is closed.'} Monday 09:00 to before Saturday 11:00, Melbourne time. Round locks also apply.</p>
  <p>Sales refund the original purchase cost shown below. Purchases use the current published price. Player market value is separate from available money. All transactions use virtual Dino Dollars.</p>
  <section className="card p-5 space-y-4"><h2 className="text-xl font-display font-bold">Buy, sell or replace a player</h2>
   {!data.squad&&<p><Link className="underline" href={`/fantasy/squad${query}`}>Build your first squad</Link> to use the market.</p>}
   <div className="grid gap-4 md:grid-cols-2">
    <label>Player to sell<select className="form-input mt-1 w-full" value={out} onChange={e=>setOut(e.target.value)}><option value="">Choose a player</option>{picks.map((p:any)=><option key={p.player_id} value={p.player_id}>{p.fantasy_players?.display_name} - refund {money(Number(p.purchase_price_dino_dollars))}</option>)}</select></label>
    <label>Player to buy<select className="form-input mt-1 w-full" value={incoming} onChange={e=>setIncoming(e.target.value)}><option value="">Choose a player</option>{data.players.filter((p:any)=>!owned.has(p.id)&&p.published_at).map((p:any)=><option key={p.id} value={p.id}>{p.display_name} - {money(p.price_dino_dollars)}</option>)}</select></label>
   </div>
   <p aria-live="polite">Sale refund: {money(refund)}. Purchase: {money(cost)}. After replacement: {money(marketPreview(remaining,refund,cost))}.</p>
   <div className="flex flex-wrap gap-3"><Button variant="secondary" disabled={closed||!out} onClick={()=>void act('sell')}>Sell player</Button><Button disabled={closed||!out||!incoming||remaining+refund<cost} onClick={()=>void act('swap')}>Sell and buy replacement</Button></div>
   {empty.length>0&&<><label>Empty slot<select className="form-input mt-1 w-full" value={slot} onChange={e=>setSlot(e.target.value)}><option value="">Choose a slot</option>{empty.map((s:any)=><option key={s.key} value={s.key}>{s.label}</option>)}</select></label><Button disabled={closed||!slot||!incoming||remaining<cost} onClick={()=>void act('buy')}>Buy into empty slot</Button></>}
   <p><Link href={`/fantasy/squad${query}`} className="underline">Open My squad</Link> to set leadership and submit after individual sales or purchases. An incomplete draft cannot be submitted.</p>
  </section>
  <section className="card p-5 space-y-4"><h2 className="text-xl font-display font-bold">Trade with another team</h2>
   <p>Offer the selected outgoing player for one of another team&apos;s players. Each team receives its original purchase cost back and pays the published price of its incoming player. Both teams must remain within budget. There are no cash gifts or negotiated prices.</p>
   <label>Team<select className="form-input mt-1 w-full" value={team} onChange={e=>{setTeam(e.target.value);setRequested('');}}><option value="">Choose a team</option>{data.teams.map((t:any)=><option key={t.managerId} value={t.managerId}>{t.teamName}</option>)}</select></label>
   <label>Requested player<select className="form-input mt-1 w-full" value={requested} onChange={e=>setRequested(e.target.value)}><option value="">Choose their player</option>{other?.players.filter((p:any)=>!owned.has(p.playerId)).map((p:any)=><option key={p.playerId} value={p.playerId}>{p.displayName} - {money(Number(data.players.find((v:any)=>v.id===p.playerId)?.price_dino_dollars||0))}</option>)}</select></label>
   <Button disabled={closed||!team||!requested||!out||data.squad?.status!=='submitted'} onClick={()=>void act('propose',{playerInId:requested})}>Propose trade</Button>
   <p>Offers expire after seven days. Changed squads or prices require a new offer. Players remain available to other teams in the shared catalogue.</p>
   <h3 className="font-semibold">Your trade offers</h3>
   {data.offers.length===0&&<p>No offers yet.</p>}
   {data.offers.map((o:any)=>{const pending=o.status==='pending'&&Date.parse(o.expires_at)>Date.now();const recipient=o.recipient_id===data.managerId;return <article key={o.id} className="border-t py-4 space-y-2"><p><strong>{teamName(o.proposer_id)}</strong>: {name(o.offered_player_id)} for {name(o.requested_player_id)} from <strong>{teamName(o.recipient_id)}</strong>.</p><p>{pending?'Pending':o.status==='pending'?'Expired':o.status}. Offered player&apos;s price: {money(Number(o.offered_price))}; requested player&apos;s price: {money(Number(o.requested_price))}.</p>{pending&&<div className="flex gap-3">{recipient&&<Button disabled={closed} onClick={()=>void act('accept',{offerId:o.id})}>Accept trade</Button>}<Button variant="secondary" disabled={busy} onClick={()=>void act(recipient?'decline':'cancel',{offerId:o.id})}>{recipient?'Decline':'Cancel offer'}</Button></div>}</article>;})}
  </section>
  <div aria-live="polite">{error&&<p role="alert" className="text-red-700">{error}</p>}{feedback&&<p>{feedback}</p>}</div>
 </div>;
}

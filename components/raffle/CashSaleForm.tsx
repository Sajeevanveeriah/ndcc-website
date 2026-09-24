'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import { fantasyAuthHeaders } from '@/lib/fantasy-browser';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
type Campaign={name:string;price_cents:number;active:boolean;draw_at:string};
type Sale={ticketReferences:string[];amountCents:number;paymentReference:string;deliveryStatus:string};
export default function CashSaleForm({member=false}:{member?:boolean}){
 const api=member?'/api/raffle/cash':'/api/admin/raffle/cash';
 const [campaign,setCampaign]=useState<Campaign|null>(null);const [name,setName]=useState('');const [email,setEmail]=useState('');const [phone,setPhone]=useState('');const [quantity,setQuantity]=useState(1);const [confirmed,setConfirmed]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [sale,setSale]=useState<Sale|null>(null);
 const [key,setKey]=useState('');const [pending,setPending]=useState(false);const attempted=useRef<Record<string,unknown>|null>(null);
 const load=useCallback(async()=>{setError('');try{
 const url=new URL(window.location.href);let saleKey=url.searchParams.get('sale');
 if(!saleKey||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saleKey)){saleKey=crypto.randomUUID();url.searchParams.set('sale',saleKey);window.history.replaceState(null,'',url);}
 setKey(saleKey);
 const res=await fetch(`${api}?sale=${encodeURIComponent(saleKey)}`,{cache:'no-store',headers:member?await fantasyAuthHeaders():{}});const data=await res.json();if(!res.ok)throw new Error(data.error);setCampaign(data.campaign);if(data.sale)setSale(data.sale);}catch(reason){setError(reason instanceof Error?reason.message:'Unable to load raffle.');}},[api,member]);
 useEffect(()=>{void load();},[load]);
 const submit=async(e:React.FormEvent)=>{e.preventDefault();if(busy||sale)return;setBusy(true);setError('');
  const payload=attempted.current||{name,email,phone,quantity,priceCents:campaign?.price_cents,cashReceived:confirmed,saleKey:key};attempted.current=payload;setPending(true);
  try{const res=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json',...(member?await fantasyAuthHeaders():{})},body:JSON.stringify(payload)});const data=await res.json();if(!res.ok){if(res.status===400){attempted.current=null;setPending(false);}throw new Error(data.error||'Unable to confirm sale.');}setSale(data);setPending(false);}catch(reason){setError(reason instanceof Error?reason.message:'Connection interrupted. Retry this same sale to retrieve its result. Do not accept payment twice.');}finally{setBusy(false);}
 };
 const available=campaign?.active&&Date.parse(campaign.draw_at)>Date.now();
 const deliveryMessage=sale?.deliveryStatus==='delivered'
  ?'The email provider accepted the tickets and receipt for delivery.'
  :['queued','processing','retry'].includes(sale?.deliveryStatus||'')
   ?'Tickets and receipt are queued for email delivery. The cash sale is saved; do not enter it again.'
   :['dead_letter','cancelled'].includes(sale?.deliveryStatus||'')
    ?'Email delivery needs staff attention. The cash sale and ticket numbers are saved; do not enter another sale. Ask an administrator to check email diagnostics.'
    :'Email delivery status could not be confirmed. The cash sale and ticket numbers are saved; refresh the status or ask an administrator to check email diagnostics. Do not enter another sale.';
 return <div className="mx-auto max-w-xl space-y-5"><Link href={member?"/raffle":"/admin/raffle"} className="underline">{member?"Back to trailer raffle":"Raffle administration"}</Link><h1 className="text-3xl font-bold">Trailer raffle cash sales</h1><p>Bookmark this page on your phone, or choose your browser&apos;s Add to Home Screen option. {member?"Use your active club account. New accounts need their membership confirmed by the club. No committee role is needed. Record cash only after collecting it, then hand the money to the club. Each sale is recorded against your account.":"Sign in with a committee account that has Raffle access."}</p>
 {error&&<div role="alert" className="rounded border border-red-300 p-3"><p>{error}</p>{member&&<Link href="/club-account" className="underline">Sign in or complete My Account</Link>}</div>}
 {!campaign?<Button onClick={load}>Reload raffle</Button>:sale?<div className="space-y-4" role="status"><h2 className="text-xl font-bold">Cash sale recorded</h2><p>AUD ${(sale.amountCents/100).toFixed(2)} received. Payment reference: {sale.paymentReference}</p><ul>{sale.ticketReferences.map(ref=><li className="font-mono" key={ref}>{ref}</li>)}</ul><p>{deliveryMessage}</p>{member&&<p>Hand AUD ${(sale.amountCents/100).toFixed(2)} to the club and quote this payment reference. The club will record when it receives the cash.</p>}<Button variant="secondary" onClick={load}>Refresh email status</Button><Button onClick={()=>{setSale(null);setName('');setEmail('');setPhone('');setQuantity(1);setConfirmed(false);const nextKey=crypto.randomUUID();setKey(nextKey);const url=new URL(window.location.href);url.searchParams.set('sale',nextKey);window.history.replaceState(null,'',url);attempted.current=null;}}>Start next sale</Button></div>:
 <form onSubmit={submit} className="space-y-4"><p>{campaign.name} - AUD ${(campaign.price_cents/100).toFixed(2)} per ticket</p>{!available&&<p role="alert">Cash sales are currently closed.</p>}
 <fieldset disabled={busy||pending} className="space-y-4"><Input id="cash-name" label="Purchaser full name" value={name} onChange={e=>setName(e.target.value)} maxLength={120} required/><Input id="cash-email" label="Email for tickets" type="email" value={email} onChange={e=>setEmail(e.target.value)} maxLength={254} required/><Input id="cash-phone" label="Phone (optional)" type="tel" value={phone} onChange={e=>setPhone(e.target.value)} maxLength={40}/><Input id="cash-quantity" label="Number of tickets" type="number" min={1} max={20} value={quantity} onChange={e=>{setQuantity(Number(e.target.value));setConfirmed(false);}} required/>
 <p className="text-xl font-bold">Cash to collect: AUD ${(quantity*campaign.price_cents/100).toFixed(2)}</p><label className="flex gap-3"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} required/><span>I have received this exact amount in cash and checked the purchaser&apos;s email address.</span></label><p className="text-sm">Tell the purchaser their details are used for the raffle and receipt. <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="underline">Privacy statement</Link></p></fieldset>
 <Button disabled={busy||!available||!confirmed||!key}>{busy?'Recording...':pending?'Retry this same sale':'Accept cash and issue tickets'}</Button>{pending&&<p>Details are locked while the result is uncertain. Retry this sale or reload this bookmarked URL to check whether it was recorded. Do not start a different sale until this one is resolved. Your reference: {key}. If the problem persists, check the raffle orders before starting another sale.</p>}
 </form>}</div>;
}

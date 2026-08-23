'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';

type VisibilityMode = 'hidden' | 'scheduled' | 'visible';
type Campaign = { id:string; name:string; active:boolean; public_visibility_mode:VisibilityMode; public_opens_at:string|null };
type Order = { id:string; customer_name:string; customer_email:string; quantity:number; amount_cents:number; status:string; created_at:string; customer_email_sent_at:string|null; staff_email_sent_at:string|null };

function toLocalDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function AdminRafflePage() {
  const [campaign,setCampaign]=useState<Campaign|null>(null); const [orders,setOrders]=useState<Order[]>([]);
  const [error,setError]=useState(''); const [message,setMessage]=useState(''); const [saving,setSaving]=useState(false);
  useEffect(()=>{ void Promise.all([
    adminFetch('/api/admin/resources/raffleCampaigns').then(r=>parseApiResponse<{data:Campaign[]}>(r)),
    adminFetch('/api/admin/resources/raffleOrders').then(r=>parseApiResponse<{data:Order[]}>(r)),
  ]).then(([campaigns,raffleOrders])=>{setCampaign(campaigns.data?.find(item=>item.active)||campaigns.data?.[0]||null);setOrders(raffleOrders.data||[]);}).catch(e=>setError(e instanceof Error?e.message:'Could not load raffle administration.')); },[]);

  async function saveVisibility() {
    if (!campaign) return;
    if (campaign.public_visibility_mode === 'scheduled' && !campaign.public_opens_at) { setError('Choose an automatic opening date and time.'); return; }
    setSaving(true); setError(''); setMessage('');
    try {
      const result=await parseApiResponse<{data:Campaign}>(await adminFetch('/api/admin/resources/raffleCampaigns',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:campaign.id,public_visibility_mode:campaign.public_visibility_mode,public_opens_at:campaign.public_opens_at})}));
      setCampaign(result.data); setMessage('Raffle visibility settings saved. Public navigation updates without a redeployment.');
    } catch(e) { setError(e instanceof Error?e.message:'Could not save raffle visibility.'); }
    finally { setSaving(false); }
  }

  const currentlyVisible=campaign?.active===true&&(campaign.public_visibility_mode==='visible'||(campaign.public_visibility_mode==='scheduled'&&Boolean(campaign.public_opens_at)&&Date.now()>=new Date(campaign.public_opens_at as string).getTime()));
  return <div className="space-y-6"><div><h1 className="text-2xl font-display font-bold">Raffle</h1><p className="text-content-muted">AUD 5 per ticket. Drawn 19 December 2026 at the Christmas Party.</p>{currentlyVisible&&<Link className="text-maroon-700 underline" href="/raffle" target="_blank">Open public raffle page</Link>}</div>
    {error&&<p role="alert" className="text-red-700">{error}</p>}{message&&<p role="status" className="text-green-700">{message}</p>}
    <section className="rounded-lg border border-edge-subtle bg-surface-card p-5 space-y-4" aria-labelledby="raffle-visibility-title"><div><h2 id="raffle-visibility-title" className="font-display text-xl font-bold">Public visibility</h2><p className="text-sm text-content-muted">The public page, navigation, footer, sitemap and checkout all follow this setting.</p></div>
      {!campaign?<p>Loading raffle campaign...</p>:<><label className="block"><span className="mb-1 block text-sm font-semibold">Visibility mode</span><select className="min-h-11 w-full rounded-md border border-edge-subtle bg-surface-card px-3" value={campaign.public_visibility_mode} onChange={e=>setCampaign({...campaign,public_visibility_mode:e.target.value as VisibilityMode})}><option value="hidden">Hidden</option><option value="scheduled">Scheduled</option><option value="visible">Visible now</option></select></label>
        {campaign.public_visibility_mode==='scheduled'&&<Input id="raffle-public-opens-at" type="datetime-local" label="Automatically opens at - Melbourne time" value={toLocalDateTime(campaign.public_opens_at)} onChange={e=>setCampaign({...campaign,public_opens_at:e.target.value?new Date(e.target.value).toISOString():null})}/>}<p className="text-sm font-semibold">Current public state: {currentlyVisible?'Visible':'Hidden'}</p><Button onClick={saveVisibility} isLoading={saving}>Save visibility settings</Button></>}
    </section>
    <div className="rounded-lg border border-edge-subtle bg-surface-card p-4"><p className="font-bold">Ticket issuing rule</p><p className="text-sm text-content-muted">References use NDCCRAF-26XXXX. Tickets and emails are created only after Stripe confirms payment. Staff notifications go to the club, vice-president and secretary raffle recipients.</p></div>
    <Table><TableHead><TableRow><TableHeader>Purchaser</TableHeader><TableHeader>Quantity</TableHeader><TableHeader>Total</TableHeader><TableHeader>Status</TableHeader><TableHeader>Emails</TableHeader><TableHeader>Created</TableHeader></TableRow></TableHead><TableBody>{orders.map(o=><TableRow key={o.id}><TableCell><strong>{o.customer_name}</strong><br/><span className="text-xs">{o.customer_email}</span></TableCell><TableCell>{o.quantity}</TableCell><TableCell>${(o.amount_cents/100).toFixed(2)}</TableCell><TableCell>{o.status}</TableCell><TableCell>{o.customer_email_sent_at?'Customer sent':'Customer pending'}<br/>{o.staff_email_sent_at?'Staff sent':'Staff pending'}</TableCell><TableCell>{new Date(o.created_at).toLocaleString('en-AU')}</TableCell></TableRow>)}</TableBody></Table>
  </div>;
}

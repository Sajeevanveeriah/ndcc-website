'use client';
import Link from 'next/link';
import CashCollections from '@/components/raffle/CashCollections';
import RaffleSales from '@/components/raffle/RaffleSales';
import { useEffect, useState } from 'react';
import PurchaseTabs from '@/components/admin/PurchaseTabs';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import WheelCampaignManager from './wheel/WheelCampaignManager';
import { isWheelCampaignCode } from '@/lib/prize-wheel/rules';
import { RAFFLE_SAMPLE_REFERENCE, REVERSE_RAFFLE_CAMPAIGN_CODE, REVERSE_RAFFLE_MAX_NUMBER, REVERSE_RAFFLE_MIN_NUMBER, REVERSE_RAFFLE_NUMBER_RANGE_LABEL } from '@/lib/raffle-constants';

type VisibilityMode = 'hidden' | 'scheduled' | 'visible';
type Campaign = { id:string; code:string; year_code?:string|null; price_cents:number; draw_label:string|null; name:string; active:boolean; public_visibility_mode:VisibilityMode; public_opens_at:string|null };

function ticketReferenceRule(campaign: Campaign | null) {
  if (isWheelCampaignCode(campaign?.code)) return `NDCCWHL-${campaign.code.slice(7)}-NNN (buyer-picked wheel numbers)`;
  if (!campaign?.year_code) return campaign?.code === REVERSE_RAFFLE_CAMPAIGN_CODE ? REVERSE_RAFFLE_NUMBER_RANGE_LABEL : RAFFLE_SAMPLE_REFERENCE;
  const prefix = `${campaign.code}-${campaign.year_code}`;
  if (campaign.code === REVERSE_RAFFLE_CAMPAIGN_CODE) {
    const pad = (n: number) => String(n).padStart(4, '0');
    return `${REVERSE_RAFFLE_NUMBER_RANGE_LABEL} (${prefix}${pad(REVERSE_RAFFLE_MIN_NUMBER)} to ${prefix}${pad(REVERSE_RAFFLE_MAX_NUMBER)})`;
  }
  return campaign?.code === 'NDCCRAF' ? `NDCCTRO-20${campaign.year_code}XXXX (legacy tickets remain valid)` : `${prefix}XXXX`;
}

function toLocalDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function AdminRafflePage() {
  const [campaigns,setCampaigns]=useState<Campaign[]>([]);
  const [campaign,setCampaign]=useState<Campaign|null>(null);
  const [salesRevision,setSalesRevision]=useState(0);
  const [error,setError]=useState(''); const [message,setMessage]=useState(''); const [saving,setSaving]=useState(false);
  useEffect(()=>{ void adminFetch('/api/admin/resources/raffleCampaigns')
    .then(r=>parseApiResponse<{data:Campaign[]}>(r))
    .then(result=>{setCampaigns(result.data || []);setCampaign(result.data?.find(item=>item.id===new URLSearchParams(window.location.search).get('campaign'))||result.data?.find(item=>item.active)||result.data?.[0]||null);})
    .catch(e=>setError(e instanceof Error?e.message:'Could not load raffle administration.')); },[]);

  async function saveVisibility() {
    if (!campaign) return;
    if (campaign.public_visibility_mode === 'scheduled' && !campaign.public_opens_at) { setError('Choose an automatic opening date and time.'); return; }
    setSaving(true); setError(''); setMessage('');
    try {
      const result=await parseApiResponse<{data:Campaign}>(await adminFetch('/api/admin/resources/raffleCampaigns',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:campaign.id,public_visibility_mode:campaign.public_visibility_mode,public_opens_at:campaign.public_opens_at})}));
      setCampaign(result.data); setCampaigns(rows => rows.map(row => row.id === result.data.id ? result.data : row)); setMessage('Raffle visibility settings saved. Public navigation updates without a redeployment.');
    } catch(e) { setError(e instanceof Error?e.message:'Could not save raffle visibility.'); }
    finally { setSaving(false); }
  }

  const currentlyVisible=campaign?.active===true&&(campaign.public_visibility_mode==='visible'||(campaign.public_visibility_mode==='scheduled'&&Boolean(campaign.public_opens_at)&&Date.now()>=new Date(campaign.public_opens_at as string).getTime()));
  return <div className="space-y-6"><div><Link href="/admin/raffle/cash" className="btn-primary">Record trailer raffle cash sale</Link><h1 className="text-2xl font-display font-bold">Raffle</h1><p className="text-content-muted">{campaign ? `${campaign.name}: AUD ${(campaign.price_cents / 100).toFixed(2)} per ticket. ${campaign.draw_label || ''}` : 'Choose a raffle campaign.'}</p>{currentlyVisible&&<Link className="text-maroon-700 underline" href={campaign?.code === REVERSE_RAFFLE_CAMPAIGN_CODE ? '/reverse-raffle' : isWheelCampaignCode(campaign?.code) ? '/prize-wheel' : '/raffle'} target="_blank">Open public raffle page</Link>}</div>
    <PurchaseTabs active={campaign?.id} onCampaign={id=>{setCampaign(campaigns.find(c=>c.id===id)||null);setMessage('');window.history.replaceState(null,'',`?campaign=${id}`);}} /><label className="block"><span className="block text-sm font-semibold mb-1">Raffle campaign</span><select className="min-h-11 border rounded-md p-2 bg-surface-card" value={campaign?.id || ''} onChange={e => { setCampaign(campaigns.find(row => row.id === e.target.value) || null); setMessage(''); }}><option value="" disabled>Choose a campaign</option>{campaigns.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
    {error&&<p role="alert" className="text-red-700">{error}</p>}{message&&<p role="status" className="text-green-700">{message}</p>}
    <section className="rounded-lg border border-edge-subtle bg-surface-card p-5 space-y-4" aria-labelledby="raffle-visibility-title"><div><h2 id="raffle-visibility-title" className="font-display text-xl font-bold">Public visibility</h2><p className="text-sm text-content-muted">The public page, navigation, footer, sitemap and checkout all follow this setting.</p></div>
      {!campaign?<p>Loading raffle campaign...</p>:<><label className="block"><span className="mb-1 block text-sm font-semibold">Visibility mode</span><select className="min-h-11 w-full rounded-md border border-edge-subtle bg-surface-card px-3" value={campaign.public_visibility_mode} onChange={e=>setCampaign({...campaign,public_visibility_mode:e.target.value as VisibilityMode})}><option value="hidden">Hidden</option><option value="scheduled">Scheduled</option><option value="visible">Visible now</option></select></label>
        {campaign.public_visibility_mode==='scheduled'&&<Input id="raffle-public-opens-at" type="datetime-local" label="Automatically opens at - Melbourne time" value={toLocalDateTime(campaign.public_opens_at)} onChange={e=>setCampaign({...campaign,public_opens_at:e.target.value?new Date(e.target.value).toISOString():null})}/>}<p className="text-sm font-semibold">Current public state: {currentlyVisible?'Visible':'Hidden'}</p><Button onClick={saveVisibility} isLoading={saving}>Save visibility settings</Button></>}
    </section>
    <div className="rounded-lg border border-edge-subtle bg-surface-card p-4"><p className="font-bold">Ticket issuing rule</p><p className="text-sm text-content-muted">References use {ticketReferenceRule(campaign)}. Tickets and emails are created after confirmed card payment or an authorised cash receipt. Staff notifications go to the club, vice-president and secretary raffle recipients.</p></div>
    {campaign?.code==='NDCCRAF'&&<CashCollections onReconciled={()=>setSalesRevision(value=>value+1)} />}
    <RaffleSales campaign={campaign} refreshKey={salesRevision} />
    <WheelCampaignManager />
  </div>;
}

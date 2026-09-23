'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { purchaseGroupLabel } from '@/lib/orders/purchase-groups';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';

export default function PurchaseTabs({ active = '', onSelect, onCampaign }: { active?: string; onSelect?: (group: string) => void; onCampaign?: (id:string)=>void }) {
  const [groups, setGroups] = useState(['merch', 'kitchen', 'membership', 'donation']);
  const [campaigns, setCampaigns] = useState<Array<{id: string; name: string}>>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([
      // Distinct groups are computed server-side over every order (lightweight select).
      adminFetch('/api/admin/orders/groups').then(r => parseApiResponse<{data:string[]}>(r)),
      adminFetch('/api/admin/resources/raffleCampaigns').then(r => parseApiResponse<{data:Array<{id:string;name:string}>}>(r)),
      adminFetch('/api/admin/resources/events').then(r => parseApiResponse<{data:Array<{title:string;ticket_price:number}>}>(r)),
    ]).then(([orderGroups, raffles, events]) => {
      setGroups(Array.from(new Set(['merch','kitchen','membership','donation', ...orderGroups.data, ...events.data.filter(e=>Number(e.ticket_price)>0).map(e=>`event:${e.title}`)])));
      setCampaigns(raffles.data);
    }).catch(()=>setError('Some purchase tabs could not be loaded. Refresh to try again.'));
  }, []);
  const style = (selected: boolean) => `inline-flex min-h-11 items-center rounded-lg border px-4 py-2 text-sm ${selected ? 'bg-maroon-700 text-white border-maroon-700' : 'bg-surface-card border-edge-subtle text-content-primary'}`;
  return <div className="mb-6 space-y-2"><nav aria-label="Purchase categories" className="flex flex-wrap gap-2">
    {groups.map(group => onSelect ? <button key={group} type="button" aria-pressed={active===group} className={style(active===group)} onClick={()=>onSelect(group)}>{purchaseGroupLabel(group)}</button>
      : <Link key={group} href={`/admin/orders?group=${encodeURIComponent(group)}`} className={style(active===group)}>{purchaseGroupLabel(group)}</Link>)}
    {campaigns.map(c=>onCampaign?<button type="button" key={c.id} aria-pressed={active===c.id} className={style(active===c.id)} onClick={()=>onCampaign(c.id)}>{c.name}</button>:<Link key={c.id} href={`/admin/raffle?campaign=${c.id}`} aria-current={active===c.id?'page':undefined} className={style(active===c.id)}>{c.name}</Link>)}
    <Link href="/admin/fantasy/managers" className={style(false)}>Dino Coach</Link>
  </nav>{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}</div>;
}

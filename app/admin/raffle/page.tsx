'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { parseApiResponse } from '@/lib/admin-client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';

type Order = { id:string; customer_name:string; customer_email:string; quantity:number; amount_cents:number; status:string; created_at:string; customer_email_sent_at:string|null; staff_email_sent_at:string|null };
export default function AdminRafflePage() {
  const [orders,setOrders]=useState<Order[]>([]); const [error,setError]=useState('');
  useEffect(()=>{ void fetch('/api/admin/resources/raffleOrders',{cache:'no-store'}).then(async r=>setOrders((await parseApiResponse<{data:Order[]}>(r)).data||[])).catch(e=>setError(e instanceof Error?e.message:'Could not load raffle orders.')); },[]);
  return <div className="space-y-6"><div><h1 className="text-2xl font-display font-bold">Raffle</h1><p className="text-content-muted">AUD 5 per ticket. Drawn 19 December 2026 at the Christmas Party.</p><Link className="text-maroon-700 underline" href="/raffle" target="_blank">Open public raffle page</Link></div>{error&&<p className="text-red-700">{error}</p>}
    <div className="rounded-lg border border-edge-subtle bg-surface-card p-4"><p className="font-bold">Ticket issuing rule</p><p className="text-sm text-content-muted">References use NDCCRAF-26XXXX. Tickets and emails are created only after Stripe confirms payment. Staff notifications go to the club, vice-president and secretary raffle recipients.</p></div>
    <Table><TableHead><TableRow><TableHeader>Purchaser</TableHeader><TableHeader>Quantity</TableHeader><TableHeader>Total</TableHeader><TableHeader>Status</TableHeader><TableHeader>Emails</TableHeader><TableHeader>Created</TableHeader></TableRow></TableHead><TableBody>{orders.map(o=><TableRow key={o.id}><TableCell><strong>{o.customer_name}</strong><br/><span className="text-xs">{o.customer_email}</span></TableCell><TableCell>{o.quantity}</TableCell><TableCell>${(o.amount_cents/100).toFixed(2)}</TableCell><TableCell>{o.status}</TableCell><TableCell>{o.customer_email_sent_at?'Customer sent':'Customer pending'}<br/>{o.staff_email_sent_at?'Staff sent':'Staff pending'}</TableCell><TableCell>{new Date(o.created_at).toLocaleString('en-AU')}</TableCell></TableRow>)}</TableBody></Table>
  </div>;
}

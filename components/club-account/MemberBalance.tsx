'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import { clubAccountJsonFetch } from '@/lib/club-account/browser';
import type { MemberPurchase } from '@/lib/club-account/purchases';

const MAX_PAGES = 25;
const money = (value: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value);

// Overview summary of balances owing on the member's website orders.
// Payment itself uses the existing purchase and pay-balance flows.
export default function MemberBalance({ showPurchases }: { showPurchases: () => void }) {
  const [owing, setOwing] = useState<MemberPurchase[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    // Read every page of orders (20 per page) so the total covers older
    // unpaid orders too. Stop at MAX_PAGES and say so if more remain.
    (async () => {
      const found: MemberPurchase[] = [];
      let page = 0;
      let total = 0;
      do {
        const data = await clubAccountJsonFetch<{ purchases: MemberPurchase[]; total: number }>(`/api/club-account/purchases?kind=orders&page=${page}`);
        found.push(...data.purchases);
        total = data.total;
        page += 1;
        if (!data.purchases.length) break;
      } while (found.length < total && page < MAX_PAGES);
      if (!active) return;
      setOwing(found.filter(order => order.can_pay && order.balance !== null && order.balance > 0));
      setMore(total > found.length);
    })().catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  const total = (owing || []).reduce((sum, order) => sum + (order.balance || 0), 0);
  return <section aria-labelledby="member-balance-heading" className="rounded-xl border border-edge-subtle p-5">
    <h2 id="member-balance-heading" className="text-xl font-bold">Balance owing</h2>
    {error ? <p className="mt-2 text-sm">Balances are temporarily unavailable. <button type="button" className="underline" onClick={showPurchases}>Open my purchases</button></p>
      : owing === null ? <p role="status" className="mt-2 text-sm">Checking your orders...</p>
      : owing.length === 0 ? <p className="mt-2 text-sm text-content-secondary">Nothing is owing on your website orders.{more ? ' Older orders are listed under My purchases.' : ''}</p>
      : <div className="mt-3 space-y-3">
        <p className="text-lg font-semibold">{money(total)} owing on {owing.length === 1 ? '1 order' : `${owing.length} orders`}</p>
        {more && <p className="text-sm text-content-secondary">This total covers your latest {MAX_PAGES * 20} orders. Older orders are listed under My purchases.</p>}
        <ul className="space-y-2 text-sm">{owing.map(order => <li key={order.id} className="flex flex-wrap items-center justify-between gap-3"><span className="break-all">{order.reference || 'Order'}: {money(order.balance || 0)}</span>{order.reference && <Link className="underline" href={`/pay-balance?reference=${encodeURIComponent(order.reference)}`}>Pay balance</Link>}</li>)}</ul>
        <Button size="sm" variant="secondary" onClick={showPurchases}>View my purchases</Button>
      </div>}
  </section>;
}

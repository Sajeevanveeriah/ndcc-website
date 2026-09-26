'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import { clubAccountJsonFetch } from '@/lib/club-account/browser';
import type { MemberPurchase } from '@/lib/club-account/purchases';
import { purchaseGroupLabel } from '@/lib/orders/purchase-groups';
const money = (value: number | null) => value === null ? 'Not available' : new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value);
export default function MemberPurchases({ email }: { email: string }) {
  const [kind, setKind] = useState('orders'); const [page, setPage] = useState(0);
  const [result, setResult] = useState<{ purchases: MemberPurchase[]; total: number } | null>(null);
  const [error, setError] = useState(''); const [retry, setRetry] = useState(0); const [paying, setPaying] = useState('');
  useEffect(() => {
    let active = true; setResult(null); setError('');
    clubAccountJsonFetch<{ purchases: MemberPurchase[]; total: number }>(`/api/club-account/purchases?kind=${kind}&page=${page}`)
      .then(data => { if (active) setResult(data); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load purchases.'); });
    return () => { active = false; };
  }, [kind, page, retry]);
  async function pay(order: MemberPurchase) {
    setPaying(order.id); setError('');
    try {
      const response = await fetch('/api/payments/balance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference: order.reference, email, checkout: true }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Secure payment is temporarily unavailable.');
      const destination = new URL(data.checkout_url);
      if (destination.protocol !== 'https:' || destination.hostname !== 'checkout.stripe.com' || destination.username || destination.password) throw new Error('Secure payment is temporarily unavailable.');
      window.location.assign(destination.href);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Payment could not be opened.'); }
    finally { setPaying(''); }
  }
  return <section aria-labelledby="member-purchases-heading" className="space-y-5">
    <div><h2 id="member-purchases-heading" className="text-2xl font-bold">Your purchases</h2><p className="mt-2 break-words text-content-secondary">Website orders placed with {email}. Purchases under another email address will not appear here.</p></div>
    <div className="flex flex-wrap items-end gap-3"><label className="flex-1">Purchase type<select className="form-input mt-1 w-full" value={kind} onChange={event => { setKind(event.target.value); setPage(0); }}><option value="orders">Orders and event purchases</option><option value="raffle">Raffle tickets</option></select></label><Button variant="secondary" onClick={() => setRetry(retry + 1)}>Refresh purchases</Button></div>
    {error && <p role="alert" className="rounded-lg border border-red-300 p-3">{error}</p>}
    {!result && !error && <p role="status">Loading your purchases...</p>}
    {result && result.purchases.length === 0 && <div className="rounded-xl border border-edge-subtle p-6"><h3 className="font-semibold">No purchases found for this email</h3><p className="mt-2 text-content-secondary">You can still browse club events, order meals or shop for apparel.</p><div className="mt-4 flex flex-wrap gap-4"><Link className="underline" href="/events">Club events</Link><Link className="underline" href="/kitchen">Order meals</Link><Link className="underline" href="/merchandise">Shop apparel</Link></div></div>}
    {result?.purchases.map(order => <article key={order.id} className="space-y-4 rounded-xl border border-edge-subtle bg-surface-card p-4 sm:p-6">
      <div className="flex flex-wrap justify-between gap-2"><div><p className="text-sm text-content-secondary">{purchaseGroupLabel(order.category)}</p><h3 className="break-all font-semibold">{order.reference || 'Order reference unavailable'}</h3></div><span className="text-sm">{new Date(order.created_at).toLocaleDateString('en-AU', { timeZone: 'Australia/Melbourne', day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
      <ul className="space-y-1 text-sm">{order.items.map((item, index) => <li key={index}>{item.name} x {item.quantity}</li>)}</ul>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><div><dt className="text-content-secondary">Total</dt><dd className="font-semibold">{money(order.total)}</dd></div><div><dt className="text-content-secondary">Paid</dt><dd>{money(order.paid)}</dd></div>{order.category !== 'raffle' && <div><dt className="text-content-secondary">Balance</dt><dd className="font-semibold">{money(order.balance)}</dd></div>}<div><dt className="text-content-secondary">Payment</dt><dd className="capitalize">{order.payment_status.replaceAll('_', ' ')}</dd></div></dl>
      {order.category !== 'raffle' && <p className="text-sm">Order status: {order.order_status.replaceAll('_', ' ')}. {order.processed ? 'Processed by the club.' : 'Not marked as processed.'}</p>}
      {order.tickets.length > 0 && <p className="text-sm">Your ticket numbers: {order.tickets.map(ticket => ticket.number).join(', ')}</p>}
      {order.bank_transfer_selected && order.can_pay && <p className="text-sm">Bank transfer selected - awaiting receipt confirmation.</p>}
      {order.can_pay && order.category === 'merch' && <Button onClick={() => void pay(order)} isLoading={paying === order.id}>Pay apparel balance</Button>}
      {order.can_pay && <Link className="inline-block rounded-lg border border-edge-strong px-4 py-3 underline" href={`/pay-balance?reference=${encodeURIComponent(order.reference)}`}>Payment options / bank deposit</Link>}
      {['needs_review', 'refunded', 'partially_refunded'].includes(order.payment_status) && <Link className="inline-block underline" href="/contact">Contact the club about this purchase</Link>}
    </article>)}
    {result && result.total > 20 && <div className="flex items-center gap-3"><Button variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous purchases</Button><p className="text-sm">Page {page + 1} of {Math.ceil(result.total / 20)}</p><Button variant="secondary" disabled={(page + 1) * 20 >= result.total} onClick={() => setPage(page + 1)}>Next purchases</Button></div>}
    <p className="text-sm text-content-secondary">Need a receipt or help with an older purchase? <Link className="underline" href="/contact">Contact the club</Link> and include your order reference.</p>
  </section>;
}

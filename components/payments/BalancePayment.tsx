'use client';
import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { formatCurrency } from '@/lib/utils';

type Balance = {reference:string;total:number;paid:number;balance:number;status:string;cancelled:boolean};
export default function BalancePayment() {
  const [reference,setReference]=useState(''); const [email,setEmail]=useState(''); const [token,setToken]=useState('');
  const [order,setOrder]=useState<Balance|null>(null); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  async function lookup(checkout=false, linkToken=token) {
    setBusy(true); setError('');
    try {
      const res=await fetch('/api/payments/balance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reference,email,token:linkToken||undefined,checkout})});
      const data=await res.json();
      if(!res.ok) throw new Error(data.error||'Could not load your balance.');
      if(checkout) { const url=new URL(data.checkout_url); if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com') throw new Error('Secure checkout is unavailable. Please try again.'); window.location.assign(url.href); }
      else setOrder(data);
    } catch(e) {setError(e instanceof Error?e.message:'Please try again.');} finally {setBusy(false);}
  }
  useEffect(()=>{const value=new URLSearchParams(window.location.search).get('token');if(value){setToken(value);void lookup(false,value);}},[]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="rounded-xl border border-edge-subtle bg-surface-card p-6 space-y-5">
    <p>Use the reference from your order confirmation and the email address used for the order. Your payment will be added to that same order.</p>
    <p className="font-semibold">Full payment is required to process your apparel order.</p>
    {!token&&<form className="space-y-4" onSubmit={e=>{e.preventDefault();void lookup();}}><Input id="balance-reference" label="Order reference" required maxLength={80} value={reference} onChange={e=>{setReference(e.target.value);setOrder(null);}}/><Input id="balance-email" label="Order email" type="email" required maxLength={254} value={email} onChange={e=>{setEmail(e.target.value);setOrder(null);}}/><Button type="submit" isLoading={busy}>Find my order</Button></form>}
    {error&&<p role="alert" className="text-red-700">{error}</p>}
    {order&&<div className="space-y-4" aria-live="polite"><h2 className="font-semibold">{order.reference}</h2><dl className="grid grid-cols-2 gap-3"><dt>Order total</dt><dd>{formatCurrency(order.total)}</dd><dt>Paid</dt><dd>{formatCurrency(order.paid)}</dd><dt className="font-bold">Balance due</dt><dd className="font-bold">{formatCurrency(order.balance)}</dd></dl>
      {order.cancelled||['refunded','partially_refunded','needs_review'].includes(order.status)?<p>Please contact the club about this order.</p>:order.balance<=0?<p>This order is fully paid. Thank you.</p>:<Button onClick={()=>void lookup(true)} isLoading={busy}>Pay {formatCurrency(order.balance)} securely with Stripe</Button>}
    </div>}
    {token&&<button type="button" className="underline text-sm" onClick={()=>{setToken('');setOrder(null);setError('');window.history.replaceState(null,'','/pay-balance');}}>Find another order by reference</button>}
  </div>;
}

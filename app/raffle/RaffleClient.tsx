'use client';
import Link from 'next/link';
import PaymentMethodChoice from '@/components/payments/PaymentMethodChoice';
import BankTransferInstructions, { type BankTransferConfirmation } from '@/components/payments/BankTransferInstructions';
import { useState, type ReactNode } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { formatRaffleAud, RAFFLE_CAMPAIGN_CODE, RAFFLE_FALLBACK_DISPLAY, RAFFLE_SAMPLE_REFERENCE } from '@/lib/raffle-constants';

// Display values for the trailer raffle. The public status API does not yet
// return price/draw details, so these come from the shared raffle constants.
const RAFFLE = RAFFLE_FALLBACK_DISPLAY[RAFFLE_CAMPAIGN_CODE];
const PRICE = formatRaffleAud(RAFFLE.priceCents);

// `children` is the club-member action (record cash sales) supplied by the
// server page; it sits with the pay-at-the-club note.
export default function RaffleClient({ children }: { children?: ReactNode }) {
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'bank_transfer'>('stripe');
  const [bankConfirmation, setBankConfirmation] = useState<BankTransferConfirmation | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', quantity: 1 });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function checkout(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const res = await fetch('/api/raffle/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, payment_method: paymentMethod }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Checkout failed.'); if (data.bank_transfer) { setBankConfirmation(data); setBusy(false); return; } if (!data.checkout_url) throw new Error('Checkout failed.'); window.location.href = data.checkout_url; }
    catch (e) { setError(e instanceof Error ? e.message : 'Checkout failed.'); setBusy(false); }
  }
  return <>
    <section className="page-hero px-0 sm:px-0 lg:px-0"><div className="nd-wrap">
      <nav aria-label="Breadcrumb" className="nd-crumbs"><Link href="/">Home</Link> / <Link href="/fundraising">Fund Raiser</Link> / <span aria-current="page">Raffle</span></nav>
      <h1 className="page-hero-title">{RAFFLE.name}</h1>
      <p className="page-hero-subtitle">{PRICE} per ticket.{RAFFLE.drawLabel ? ` ${RAFFLE.drawLabel}.` : ''} Support the Dinos and be in the draw.</p>
    </div></section>
    <section className="nd-sec-tight"><div className="nd-wrap nd-two-col">
      <section aria-labelledby="raffle-how" className="nd-card space-y-4 p-6 sm:p-[26px]">
        <h2 id="raffle-how" className="font-display text-2xl font-semibold tracking-[-0.02em] text-content-primary">How it works</h2>
        <ul className="m-0 grid list-disc gap-2 pl-5 text-content-secondary">
          <li>Tickets are {PRICE} each. Ticket numbering starts at 200.</li>
          <li>Tickets are issued after online payment, cash payment, or once your bank deposit is confirmed.</li>
          <li>Your numbered ticket image and receipt will be emailed to you.</li>
          {RAFFLE.drawLabel && <li>{RAFFLE.drawLabel}.</li>}
        </ul>
        <dl className="nd-facts border-t border-edge-subtle pt-4 text-[15px]">
          <dt>Price</dt><dd>{PRICE} per ticket</dd>
          {RAFFLE.drawLabel && <><dt>Draw</dt><dd>{RAFFLE.drawLabel}</dd></>}
          <dt>Example ticket reference</dt><dd className="break-all font-mono">{RAFFLE_SAMPLE_REFERENCE}</dd>
        </dl>
        <p className="text-sm text-content-muted"><strong className="text-content-primary">Paying at the club?</strong> Buy from a club member or at the bar with cash. They record the sale against your name and email, and your ticket is emailed to you.</p>
        {children && <div>{children}</div>}
      </section>
      {bankConfirmation ? <div className="nd-card p-6 sm:p-[26px]"><BankTransferInstructions confirmation={bankConfirmation} /></div> : <form onSubmit={checkout} className="nd-card space-y-4 p-6 sm:p-[26px]"><h2 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-content-primary">Buy tickets</h2><Input id="raffle-name" label="Name" required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><Input id="raffle-email" label="Email" type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/><Input id="raffle-phone" label="Phone" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/><Input id="raffle-quantity" label="Number of tickets" type="number" min={1} max={20} required value={form.quantity} onChange={e=>setForm({...form,quantity:Number(e.target.value)})}/><p className="flex justify-between gap-3 font-semibold text-content-primary"><span>Total</span><span>${(form.quantity*RAFFLE.priceCents/100).toFixed(2)} AUD</span></p>{error&&<p className="text-red-700 dark:text-red-400" role="alert">{error}</p>}<PaymentMethodChoice method={paymentMethod} onChange={setPaymentMethod} product="raffle" /><Button type="submit" isLoading={busy} className="w-full">{paymentMethod === 'bank_transfer' ? 'Continue with bank deposit' : 'Pay securely with Stripe'}</Button></form>}
    </div></section></>;
}

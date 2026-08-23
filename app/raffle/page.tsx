'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function RafflePage() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', quantity: 1 });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function checkout(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const res = await fetch('/api/raffle/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }); const data = await res.json(); if (!res.ok || !data.checkout_url) throw new Error(data.error || 'Checkout failed.'); window.location.href = data.checkout_url; }
    catch (e) { setError(e instanceof Error ? e.message : 'Checkout failed.'); setBusy(false); }
  }
  return <><section className="page-hero"><div className="container-width"><h1 className="page-hero-title">Dinos Trailer Raffle</h1><p className="page-hero-subtitle">Support the Dinos and be in the draw.</p></div></section>
    <main className="section-padding"><div className="container-width max-w-4xl grid gap-8 md:grid-cols-2 items-start">
      <section className="space-y-4"><div className="rounded-xl border-4 border-maroon-800 bg-white p-6 text-center shadow-card"><p className="text-sm font-bold text-maroon-800">NEWCOMB AND DISTRICT CRICKET CLUB</p><h2 className="font-display text-4xl font-black text-maroon-900 my-4">DINOS TRAILER RAFFLE</h2><div className="rounded-lg border-2 border-maroon-800 p-4"><p className="text-xs font-bold text-blue-700">TICKET REFERENCE</p><p className="font-mono text-3xl font-black text-maroon-900">NDCCRAF-26XXXX</p></div><p className="mt-4 text-2xl font-black text-gold-700">$5.00 AUD</p><p className="font-bold text-maroon-900">DRAWN 19 DECEMBER 2026<br/>AT THE CHRISTMAS PARTY</p></div><p className="text-sm text-content-muted">Ticket numbers are issued only after Stripe confirms payment. Your numbered ticket image will be emailed to you.</p></section>
      <form onSubmit={checkout} className="rounded-xl border border-edge-subtle bg-surface-card p-6 space-y-4"><h2 className="font-display text-2xl font-bold">Buy raffle tickets</h2><Input id="raffle-name" label="Name" required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><Input id="raffle-email" label="Email" type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/><Input id="raffle-phone" label="Phone" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/><Input id="raffle-quantity" label="Number of tickets" type="number" min={1} max={20} required value={form.quantity} onChange={e=>setForm({...form,quantity:Number(e.target.value)})}/><p className="font-bold">Total: ${(form.quantity*5).toFixed(2)} AUD</p>{error&&<p className="text-red-700" role="alert">{error}</p>}<Button type="submit" isLoading={busy}>Pay securely with Stripe</Button></form>
    </div></main></>;
}

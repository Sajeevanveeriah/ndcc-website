'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function ReverseRaffleClient({ priceCents, drawLabel }: { priceCents: number; drawLabel: string | null }) {
  const paymentResult = useSearchParams().get('payment');
  const [form, setForm] = useState({ name: '', email: '', phone: '', quantity: 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const validQuantity = Number.isInteger(form.quantity) && form.quantity >= 1 && form.quantity <= 20;
  async function checkout(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !validQuantity) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/raffle/checkout?campaign=NDCCRRO', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok || !result.checkout_url) throw new Error(result.error || 'Checkout could not be started.');
      window.location.href = result.checkout_url;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Checkout could not be started.');
      setBusy(false);
    }
  }
  return <>
    <section className="page-hero"><div className="container-width">
      <h1 className="page-hero-title">Reverse Raffle</h1>
      <p className="page-hero-subtitle">${(priceCents / 100).toFixed(2)} AUD per ticket. Support your club.</p>
    </div></section>
    <main className="section-padding"><div className="container-width max-w-5xl grid gap-8 md:grid-cols-2 items-start">
      <Image src="/images/20260922-NDCC-Reverse-Raffle-Rev00.png" width={1600} height={2000}
        sizes="(max-width: 768px) 100vw, 480px" alt="Newcomb and District Cricket Club Reverse Raffle. $60 AUD per ticket. Support your club."
        className="w-full h-auto" priority />
      <form onSubmit={checkout} className="rounded-xl border border-edge-subtle bg-surface-card p-6 space-y-4">
        <h2 className="font-display text-2xl font-bold">Buy reverse raffle tickets</h2>
        {paymentResult === 'success' && <p role="status">Checkout completed. Your numbered tickets will be emailed once payment is confirmed.</p>}
        {paymentResult === 'cancelled' && <p role="status">Checkout was cancelled. You can try again below.</p>}
        {drawLabel && <p>{drawLabel}</p>}
        <p>100 tickets, numbered 201-300. Each ticket is $60 AUD.</p>
        <p>Your numbered ticket image and PDF payment receipt will be emailed after payment is confirmed.</p>
        <Input id="reverse-raffle-name" label="Name" required autoComplete="name" maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <Input id="reverse-raffle-email" label="Email" type="email" required autoComplete="email" maxLength={254} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        <Input id="reverse-raffle-phone" label="Phone (optional)" type="tel" autoComplete="tel" maxLength={40} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        <Input id="reverse-raffle-quantity" label="Number of tickets" type="number" min={1} max={20} step={1} required value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} />
        <p className="font-bold" aria-live="polite">{validQuantity ? `Total: $${(form.quantity * priceCents / 100).toFixed(2)} AUD` : 'Choose between 1 and 20 tickets.'}</p>
        {error && <p className="text-red-700" role="alert">{error}</p>}
        <Button type="submit" isLoading={busy} disabled={!validQuantity}>Pay securely with Stripe</Button>
      </form>
    </div></main>
  </>;
}

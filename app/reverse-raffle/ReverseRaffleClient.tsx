'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { REVERSE_RAFFLE_NUMBERS, validReverseRaffleSelection } from '@/lib/reverse-raffle-selection';
import { REVERSE_RAFFLE_CAMPAIGN_CODE, REVERSE_RAFFLE_NUMBER_RANGE_LABEL, isReverseRaffleNumber } from '@/lib/raffle-constants';

export default function ReverseRaffleClient({ priceCents, drawLabel }: { priceCents: number; drawLabel: string | null }) {
  const paymentResult = useSearchParams().get('payment');
  const [form, setForm] = useState({ name: '', email: '', phone: '', quantity: 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [unavailable, setUnavailable] = useState<number[]>([]);
  const [availabilityReady, setAvailabilityReady] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const refreshNumbers = useCallback(async () => {
    try {
      const response = await fetch('/api/raffle/numbers', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.unavailable)
        || !data.unavailable.every((n: unknown) => typeof n === 'number' && isReverseRaffleNumber(n))) {
        throw new Error('Ticket availability could not be loaded. Please try again.');
      }
      setUnavailable(data.unavailable);
      setAvailabilityReady(true);
      setAvailabilityError('');
    } catch {
      setAvailabilityReady(false);
      setAvailabilityError('Ticket availability could not be loaded. Please try again.');
    }
  }, []);
  useEffect(() => {
    void refreshNumbers();
    const timer = window.setInterval(() => { void refreshNumbers(); }, 30000);
    const onFocus = () => { void refreshNumbers(); };
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [refreshNumbers]);
  const validQuantity = Number.isInteger(form.quantity) && form.quantity >= 1 && form.quantity <= 20;
  const selectionAvailable = selectedNumbers.every(number => !unavailable.includes(number));
  const canCheckout = availabilityReady && selectionAvailable && validReverseRaffleSelection(selectedNumbers, form.quantity);
  async function checkout(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !canCheckout) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/raffle/checkout?campaign=${REVERSE_RAFFLE_CAMPAIGN_CODE}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, selectedNumbers }),
      });
      const result = await response.json();
      if (!response.ok || !result.checkout_url) throw new Error(result.error || 'Checkout could not be started.');
      window.location.href = result.checkout_url;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Checkout could not be started.');
      await refreshNumbers();
      setBusy(false);
    }
  }
  return <>
    <section className="page-hero"><div className="container-width">
      <h1 className="page-hero-title">Reverse Raffle</h1>
      <p className="page-hero-subtitle">${(priceCents / 100).toFixed(2)} AUD per ticket. Support your club.</p>
    </div></section>
    <main className="section-padding"><div className="container-width max-w-5xl grid gap-8 md:grid-cols-2 items-start">
      <Image src="/images/20260922-NDCC-Reverse-Raffle-Rev00.webp" width={1600} height={2000}
        sizes="(max-width: 768px) 100vw, 480px" alt="Newcomb and District Cricket Club Reverse Raffle. $60 AUD per ticket. Support your club."
        className="w-full h-auto" priority />
      <form onSubmit={checkout} className="rounded-xl border border-edge-subtle bg-surface-card p-6 space-y-4">
        <h2 className="font-display text-2xl font-bold">Buy reverse raffle tickets</h2>
        {paymentResult === 'success' && <p role="status">Checkout completed. Your numbered tickets will be emailed once payment is confirmed.</p>}
        {paymentResult === 'cancelled' && <p role="status">Checkout was cancelled. You can try again below.</p>}
        {drawLabel && <p>{drawLabel}</p>}
        <p>{`${REVERSE_RAFFLE_NUMBERS.length} tickets, numbered ${REVERSE_RAFFLE_NUMBER_RANGE_LABEL}. Each ticket is $60 AUD.`}</p>
        <p>Your numbered ticket image and PDF payment receipt will be emailed after payment is confirmed.</p>
        <Input id="reverse-raffle-name" label="Name" required autoComplete="name" maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <Input id="reverse-raffle-email" label="Email" type="email" required autoComplete="email" maxLength={254} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        <Input id="reverse-raffle-phone" label="Phone (optional)" type="tel" autoComplete="tel" maxLength={40} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        <Input id="reverse-raffle-quantity" label="Number of tickets" type="number" min={1} max={20} step={1} required disabled={busy} value={form.quantity} onChange={e => {
          const quantity = Number(e.target.value);
          setForm({ ...form, quantity });
          if (Number.isInteger(quantity) && quantity >= 1 && quantity <= 20) setSelectedNumbers(numbers => numbers.slice(0, quantity));
        }} />
        <fieldset disabled={busy} aria-describedby="raffle-selection-help">
          <legend className="font-bold">Choose your raffle numbers</legend>
          <p id="raffle-selection-help" className="text-sm my-2">Choose one number per ticket. Sold or held numbers are unavailable. Numbers are held when you continue to payment.</p>
          {!availabilityReady && !availabilityError && <p role="status">Loading available numbers...</p>}
          {availabilityError && <p role="alert">{availabilityError}</p>}
          <button type="button" onClick={() => { void refreshNumbers(); }} className="underline text-sm mb-3 focus-visible:outline focus-visible:outline-2">Refresh availability</button>
          <div className="grid grid-cols-5 sm:grid-cols-10 md:grid-cols-5 gap-2">
            {REVERSE_RAFFLE_NUMBERS.map(number => {
              const selected = selectedNumbers.includes(number);
              const taken = unavailable.includes(number);
              return <button key={number} type="button" aria-pressed={selected}
                aria-label={`Number ${number}${taken ? ', unavailable' : ''}`}
                disabled={!selected && (!availabilityReady || taken || !validQuantity || selectedNumbers.length >= form.quantity)}
                onClick={() => setSelectedNumbers(numbers => selected ? numbers.filter(n => n !== number) : [...numbers, number])}
                className={`min-h-11 rounded-md border text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maroon-700 ${selected ? 'bg-maroon-700 border-maroon-700 text-white' : 'border-edge-subtle bg-surface-card'} ${taken ? 'line-through opacity-50' : ''} disabled:cursor-not-allowed disabled:opacity-50`}>
                {number}
              </button>;
            })}
          </div>
          <p className="text-sm mt-3" role="status">{selectedNumbers.length} of {validQuantity ? form.quantity : 0} selected{selectedNumbers.length > 0 ? `: ${[...selectedNumbers].sort((a, b) => a - b).join(', ')}` : ''}</p>
          {!selectionAvailable && <p role="alert">A selected number is now unavailable. Deselect it and choose another number.</p>}
          {availabilityReady && unavailable.length === REVERSE_RAFFLE_NUMBERS.length && <p role="status">All numbers are sold or currently held by other checkouts.</p>}
        </fieldset>
        <p className="font-bold" aria-live="polite">{validQuantity ? `Total: $${(form.quantity * priceCents / 100).toFixed(2)} AUD` : 'Choose between 1 and 20 tickets.'}</p>
        {error && <p className="text-red-700" role="alert">{error}</p>}
        <Button type="submit" isLoading={busy} disabled={!canCheckout}>Pay securely with Stripe</Button>
      </form>
    </div></main>
  </>;
}

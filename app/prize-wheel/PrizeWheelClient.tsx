'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { WHEEL_MAX_TICKETS_PER_ORDER, formatAud, validWheelSelection } from '@/lib/prize-wheel/rules';

type Props = { code: string; priceCents: number; divisions: number };

export default function PrizeWheelClient({ code, priceCents, divisions }: Props) {
  const paymentResult = useSearchParams().get('payment');
  const numbers = useMemo(() => Array.from({ length: divisions }, (_, index) => index + 1), [divisions]);
  const [form, setForm] = useState({ name: '', email: '', phone: '', quantity: 1 });
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [unavailable, setUnavailable] = useState<number[]>([]);
  const [ready, setReady] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/raffle/wheel/numbers', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || data.code !== code || !Array.isArray(data.unavailable)
        || !data.unavailable.every((n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= divisions)) {
        throw new Error('unavailable');
      }
      setUnavailable(data.unavailable);
      setReady(true);
      setAvailabilityError('');
    } catch {
      setReady(false);
      setAvailabilityError('Ticket availability could not be loaded. Please try again.');
    }
  }, [code, divisions]);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 30000);
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [refresh]);
  const validQuantity = Number.isInteger(form.quantity) && form.quantity >= 1 && form.quantity <= WHEEL_MAX_TICKETS_PER_ORDER;
  const selectionAvailable = selected.every(number => !unavailable.includes(number));
  const canCheckout = ready && adult && selectionAvailable && validWheelSelection(selected, form.quantity, divisions);

  async function checkout(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !canCheckout) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/raffle/checkout?campaign=${encodeURIComponent(code)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, selectedNumbers: selected, payment_method: 'stripe', adult_confirmed: adult }),
      });
      const result = await response.json();
      if (!response.ok || !result.checkout_url) throw new Error(result.error || 'Checkout could not be started.');
      window.location.href = result.checkout_url;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Checkout could not be started.');
      await refresh();
      setBusy(false);
    }
  }

  return <form onSubmit={checkout} className="rounded-xl border border-edge-subtle bg-surface-card p-6 space-y-4" aria-labelledby="wheel-buy">
    <h2 id="wheel-buy" className="font-display text-2xl font-bold">Buy prize wheel tickets</h2>
    {paymentResult === 'success' && <p role="status">Checkout completed. Your numbered tickets and receipt will be emailed once payment is confirmed.</p>}
    {paymentResult === 'cancelled' && <p role="status">Checkout was cancelled. You can try again below.</p>}
    <p>Choose your wheel numbers and pay by card. Your ticket numbers go into the live draw at the clubrooms.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <Input id="wheel-name" label="Name" required autoComplete="name" maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
      <Input id="wheel-email" label="Email" type="email" required autoComplete="email" maxLength={254} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
      <Input id="wheel-phone" label="Phone (optional)" type="tel" autoComplete="tel" maxLength={40} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
      <Input id="wheel-quantity" label="Number of tickets" type="number" min={1} max={Math.min(WHEEL_MAX_TICKETS_PER_ORDER, divisions)} step={1} required disabled={busy} value={form.quantity} onChange={e => {
        const quantity = Number(e.target.value);
        setForm({ ...form, quantity });
        if (Number.isInteger(quantity) && quantity >= 1) setSelected(current => current.slice(0, quantity));
      }} />
    </div>
    <fieldset disabled={busy} aria-describedby="wheel-selection-help">
      <legend className="font-bold">Choose your wheel numbers</legend>
      <p id="wheel-selection-help" className="text-sm my-2">Choose one number per ticket. Sold or held numbers are unavailable. Numbers are held while you complete payment.</p>
      {!ready && !availabilityError && <p role="status">Loading available numbers...</p>}
      {availabilityError && <p role="alert">{availabilityError}</p>}
      <button type="button" onClick={() => { void refresh(); }} className="underline text-sm mb-3 focus-visible:outline focus-visible:outline-2">Refresh availability</button>
      <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
        {numbers.map(number => {
          const isSelected = selected.includes(number);
          const taken = unavailable.includes(number);
          return <button key={number} type="button" aria-pressed={isSelected}
            aria-label={`Number ${number}${taken ? ', sold or held' : ''}`}
            disabled={!isSelected && (!ready || taken || !validQuantity || selected.length >= form.quantity)}
            onClick={() => setSelected(current => isSelected ? current.filter(n => n !== number) : [...current, number])}
            className={`min-h-11 rounded-md border text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maroon-700 ${isSelected ? 'bg-maroon-700 border-maroon-700 text-white' : 'border-edge-subtle bg-surface-card'} ${taken ? 'line-through opacity-50' : ''} disabled:cursor-not-allowed disabled:opacity-50`}>
            {number}
          </button>;
        })}
      </div>
      <p className="text-sm mt-3" role="status">{selected.length} of {validQuantity ? form.quantity : 0} selected{selected.length > 0 ? `: ${[...selected].sort((a, b) => a - b).join(', ')}` : ''}</p>
      {!selectionAvailable && <p role="alert">A selected number is now unavailable. Deselect it and choose another number.</p>}
      {ready && unavailable.length === divisions && <p role="status">All numbers are sold or currently held by other checkouts.</p>}
    </fieldset>
    <label className="flex items-start gap-3">
      <input type="checkbox" className="mt-1 h-5 w-5" checked={adult} onChange={e => setAdult(e.target.checked)} required />
      <span>I confirm I am 18 or older.</span>
    </label>
    <p className="font-bold" aria-live="polite">{validQuantity ? `Total: ${formatAud(form.quantity * priceCents)} AUD` : `Choose between 1 and ${WHEEL_MAX_TICKETS_PER_ORDER} tickets.`}</p>
    {error && <p className="text-red-700" role="alert">{error}</p>}
    <Button type="submit" isLoading={busy} disabled={!canCheckout}>Pay securely with Stripe</Button>
  </form>;
}

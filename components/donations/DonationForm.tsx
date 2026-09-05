'use client';

import { FormEvent, useRef, useState } from 'react';
import Link from 'next/link';

export default function DonationForm() {
  const [amount, setAmount] = useState('10');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [orderId, setOrderId] = useState<string | null>(null);
  const startedAt = useRef(Date.now());
  const honeypot = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const inputClass = 'mt-2 w-full rounded-lg border border-edge-subtle bg-surface-card px-4 py-3 text-content-primary focus:outline-none focus:ring-2 focus:ring-blue-600';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      let currentOrder = orderId;
      if (!currentOrder) {
        const response = await fetch('/api/donations', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: Number(amount), name, email, hp_field: honeypot.current?.value || '', submitted_at: startedAt.current }),
        });
        const result = await response.json();
        if (!response.ok || !result.order_id) throw new Error(result.error || 'Unable to start your donation.');
        currentOrder = result.order_id;
        setOrderId(currentOrder);
      }
      const response = await fetch('/api/payments/checkout-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: currentOrder, return_path: '/sponsors/donate' }),
      });
      const result = await response.json();
      if (!response.ok || !result.checkout_url) throw new Error(result.error || 'Unable to open checkout. Please try again.');
      const url = new URL(result.checkout_url);
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('Checkout is unavailable. Please try again shortly.');
      window.location.assign(url.href);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Please try again shortly.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="section-padding bg-surface-page">
      <div className="container-width">
        <Link href="/sponsors" className="font-body text-sm text-content-muted underline underline-offset-4">Back to Sponsors</Link>
        <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:gap-20">
          <div>
            <div className="mb-6 h-1 w-16 bg-blue-500" />
            <h1 className="font-display text-4xl font-bold leading-tight text-content-primary sm:text-5xl">Back your local<br />cricket club.</h1>
            <p className="mt-6 max-w-md font-body text-lg leading-relaxed text-content-muted">Make a one-off donation to Newcomb &amp; District Cricket Club. Choose an amount that suits you, from AUD 10.</p>
            <p className="mt-5 max-w-md font-body leading-relaxed text-content-muted">Thank you for supporting the Dinos and our cricket community.</p>
          </div>
          <form onSubmit={submit} className="font-body" aria-label="Club donation">
            <fieldset disabled={busy || Boolean(orderId)}>
              <legend className="font-display text-xl font-semibold text-content-primary">Choose your donation</legend>
              <div className="mt-4 grid grid-cols-4 gap-2">
                {[10, 25, 50, 100].map((value) => <button key={value} type="button" aria-pressed={amount === String(value)} onClick={() => setAmount(String(value))}
                  className={`rounded-lg border px-2 py-3 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${amount === String(value) ? 'border-maroon-700 bg-maroon-700 text-white' : 'border-edge-subtle bg-surface-card text-content-primary hover:border-maroon-700'}`}>${value}</button>)}
              </div>
              <label className="mt-5 block text-content-primary">Amount (AUD)
                <input type="number" inputMode="decimal" min="10" max="10000" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} className={inputClass} aria-describedby="donation-amount-help" />
              </label>
              <p id="donation-amount-help" className="mt-2 text-sm text-content-muted">AUD 10 minimum. You can enter your own amount.</p>
              <label className="mt-5 block text-content-primary">Your name
                <input autoComplete="name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
              </label>
              <label className="mt-5 block text-content-primary">Email for your payment receipt
                <input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} />
              </label>
              <div hidden aria-hidden="true"><label>Leave blank<input ref={honeypot} tabIndex={-1} autoComplete="off" /></label></div>
            </fieldset>
            {error && <p role="alert" className="mt-4 text-red-700 dark:text-red-300">{error}</p>}
            <button type="submit" disabled={busy} className="mt-6 w-full rounded-lg bg-maroon-700 px-6 py-4 font-semibold text-white hover:bg-maroon-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 disabled:opacity-60">
              {busy ? 'Opening secure checkout...' : orderId ? 'Retry secure checkout' : `Donate ${new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(amount) || 0)}`}
            </button>
            <p className="mt-4 text-sm leading-relaxed text-content-muted">One-off payment through Stripe. Your payment receipt is issued after payment is confirmed. This is not a tax-deductible donation receipt.</p>
          </form>
        </div>
      </div>
    </section>
  );
}

'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import SpinWheelGraphic from '@/components/spin-wheel/SpinWheelGraphic';
import { fantasyAuthHeaders } from '@/lib/fantasy-browser';
import { rotationForNumber } from '@/lib/prize-wheel/wheel-geometry';
import { formatAud, SPIN_ANIMATION_MS, SPIN_RETURN_PATH, type PublicSpinSegment, type SpinResultView, type SpinWheelPhase } from '@/lib/spin-wheel/rules';

type Props = {
  wheel: { id: string; name: string; phase: SpinWheelPhase; freeSpins: number; priceCents: number | null; maxPerOrder: number; checkoutOpen: boolean };
  segments: PublicSpinSegment[];
};

type Me = { signedIn: boolean; via?: 'user' | 'pass'; email?: string; spinsLeft: number; results: SpinResultView[] };

const PASS_KEY = 'ndcc-spin-pass';
const ORDER_KEY = 'ndcc-spin-order';

// The spin link is a bearer credential: keep it for this tab only, so a
// shared device does not keep it after the browser closes. The emailed link
// (or "Lost your spin link?") brings it back.
function storageGet(key: string): string | null {
  try { return window.sessionStorage.getItem(key); } catch { return null; }
}
function storageSet(key: string, value: string | null) {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch { /* storage unavailable: the emailed link still works */ }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return response.json().catch(() => ({}));
}

export default function SpinWheelClient({ wheel, segments }: Props) {
  const [pass, setPass] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [loadError, setLoadError] = useState('');
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<(SpinResultView & { emailed?: boolean }) | null>(null);
  const [spinError, setSpinError] = useState('');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<string | null>(null);
  const [orderMessage, setOrderMessage] = useState('');
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => { query.removeEventListener('change', update); if (timer.current) window.clearTimeout(timer.current); };
  }, []);

  // A spin link (?pass=) moves into this browser's storage and out of the address bar.
  useEffect(() => {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get('pass');
    if (fromUrl && /^[A-Za-z0-9_-]{43}$/.test(fromUrl)) storageSet(PASS_KEY, fromUrl);
    if (url.searchParams.has('pass')) {
      url.searchParams.delete('pass');
      window.history.replaceState(null, '', url.pathname + (url.search ? url.search : '') + url.hash);
    }
    setPass(storageGet(PASS_KEY));
    setPendingOrder(storageGet(ORDER_KEY));
    setReady(true);
  }, []);

  const headers = useCallback(async (): Promise<Record<string, string>> => (pass ? { 'X-Spin-Pass': pass } : await fantasyAuthHeaders()), [pass]);

  const loadMe = useCallback(async () => {
    try {
      const response = await fetch('/api/spin-wheel/me', { cache: 'no-store', headers: await headers() });
      const data = await readJson(response);
      if (!response.ok) {
        if (response.status === 401 && pass) { storageSet(PASS_KEY, null); setPass(null); }
        throw new Error(String(data.error || 'Your spins could not be loaded.'));
      }
      setMe({ signedIn: Boolean(data.signedIn), via: data.via as Me['via'], email: data.email as string | undefined, spinsLeft: Number(data.spinsLeft) || 0, results: (data.results as SpinResultView[]) || [] });
      setLoadError('');
    } catch (failure) {
      setLoadError(failure instanceof Error ? failure.message : 'Your spins could not be loaded.');
    }
  }, [headers, pass]);

  useEffect(() => { if (ready) void loadMe(); }, [ready, loadMe]);

  // After card checkout: wait for the signed Stripe notification to mark the order paid.
  useEffect(() => {
    if (!ready || !pendingOrder) return;
    let cancelled = false;
    let tries = 0;
    const check = async () => {
      tries += 1;
      try {
        const response = await fetch(`/api/spin-wheel/orders/${encodeURIComponent(pendingOrder)}`, { cache: 'no-store', headers: await headers() });
        const data = await readJson(response);
        if (cancelled) return;
        if (response.status === 404) { storageSet(ORDER_KEY, null); setPendingOrder(null); setOrderMessage(''); return; }
        if (response.ok && data.paid) {
          storageSet(ORDER_KEY, null); setPendingOrder(null);
          setOrderMessage(`Payment confirmed. ${Number(data.quantity) === 1 ? '1 spin has' : `${data.quantity} spins have`} been added.`);
          await loadMe();
          return;
        }
        setOrderMessage('Your payment is being confirmed. Your spins will appear here shortly.');
      } catch {
        if (!cancelled) setOrderMessage('Checking your payment...');
      }
      if (!cancelled && tries < 24) timer.current = window.setTimeout(check, 5000);
      else if (!cancelled) setOrderMessage('Your payment has not been confirmed yet. If you paid, your spins will appear once it is confirmed; guests are also emailed their spin link.');
    };
    void check();
    return () => { cancelled = true; };
  }, [ready, pendingOrder, headers, loadMe]);

  async function spin() {
    if (spinning || !me || me.spinsLeft < 1) return;
    setSpinning(true); setSpinError(''); setResult(null);
    try {
      const response = await fetch('/api/spin-wheel/spin', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(await headers()) }, body: '{}' });
      const data = await readJson(response);
      if (!response.ok || !data.result) throw new Error(String(data.error || 'The spin could not be recorded.'));
      const recorded = data.result as SpinResultView;
      // Land somewhere inside the segment, not always dead centre (presentation only).
      const step = 360 / segments.length;
      const jitter = (Math.random() - 0.5) * step * 0.6;
      const target = rotationForNumber(recorded.segment_position, segments.length, rotation, reducedMotion ? 1 : 6) - jitter;
      setRotation(target);
      timer.current = window.setTimeout(() => {
        setResult({ ...recorded, emailed: data.emailed === true });
        setSpinning(false);
        setMe(current => current ? { ...current, spinsLeft: Number(data.spinsLeft) || 0, results: [{ ...recorded }, ...current.results] } : current);
      }, reducedMotion ? 0 : SPIN_ANIMATION_MS);
    } catch (failure) {
      setSpinError(failure instanceof Error ? failure.message : 'The spin could not be recorded.');
      setSpinning(false);
      void loadMe();
    }
  }

  function forgetPass() {
    storageSet(PASS_KEY, null);
    setPass(null);
    setMe(null);
  }

  const canSpin = wheel.phase === 'live' && !spinning && (me?.spinsLeft || 0) > 0;
  const status = wheel.phase === 'upcoming' ? 'This wheel is not open yet.'
    : wheel.phase === 'paused' ? 'Spins are paused at the moment.'
      : wheel.phase === 'ended' ? 'This wheel has closed.' : '';

  return <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
    <div className="mx-auto w-full max-w-[36rem]">
      <SpinWheelGraphic segments={segments} rotation={rotation} reducedMotion={reducedMotion} label={`${wheel.name} with ${segments.length} segments`} />
    </div>
    <div className="space-y-5">
      <section aria-labelledby="spin-panel" className="rounded-xl border border-edge-subtle bg-surface-card p-6 space-y-4">
        <h2 id="spin-panel" className="font-display text-2xl font-bold">Your spins</h2>
        {status && <p role="status" className="font-semibold">{status}</p>}
        {orderMessage && <p role="status">{orderMessage}</p>}
        {!ready || (!me && !loadError) ? <p role="status">Loading your spins...</p> : null}
        {loadError && <p role="alert">{loadError} <button type="button" className="underline" onClick={() => void loadMe()}>Retry</button></p>}
        {me && <>
          {me.signedIn
            ? <p>{me.via === 'pass' ? 'Using your spin link' : 'Signed in'}{me.email ? ` as ${me.email}` : ''}. <strong className="text-xl">{me.spinsLeft}</strong> {me.spinsLeft === 1 ? 'spin' : 'spins'} left.</p>
            : <p>{wheel.freeSpins > 0
              ? <><Link href="/club-account" className="underline">Sign in to your club account</Link> for {wheel.freeSpins} free {wheel.freeSpins === 1 ? 'spin' : 'spins'}, or open the spin link from your email.</>
              : <>Buy spins below, or open the spin link from your email.</>}</p>}
          <Button type="button" size="lg" className="w-full" onClick={() => void spin()} disabled={!canSpin} aria-describedby="spin-help">{spinning ? 'Spinning...' : 'Spin the wheel'}</Button>
          <p id="spin-help" className="text-sm text-content-muted">The result is recorded as soon as you press the button.</p>
          {me.via === 'pass' && <button type="button" className="text-sm underline" onClick={forgetPass}>Stop using this spin link on this device</button>}
        </>}
        <div aria-live="assertive" className="min-h-[3rem]">
          {spinError && <p role="alert" className="font-semibold text-red-700">{spinError}</p>}
          {result && <div className="rounded-lg bg-maroon-700 p-4 text-white">
            <p className="text-sm uppercase tracking-widest">Result {result.reference}</p>
            <p className="font-display text-2xl font-bold">{result.is_prize ? result.prize_name : result.segment_label}</p>
            {result.is_prize && result.prize_description && <p>{result.prize_description}</p>}
            {result.is_prize && <p className="mt-2 text-sm">{result.emailed ? 'We have emailed you the details of how to claim.' : 'Keep this result reference. See Claiming a prize on this page; we will also email you the details.'}</p>}
          </div>}
        </div>
      </section>

      {wheel.priceCents && wheel.checkoutOpen && <BuySpins wheelName={wheel.name} priceCents={wheel.priceCents} maxPerOrder={wheel.maxPerOrder}
        signedInAccount={me?.via === 'user'} authHeaders={headers}
        onStarted={(orderId, passToken) => { if (passToken) { storageSet(PASS_KEY, passToken); } storageSet(ORDER_KEY, orderId); }} />}

      <ResendLink />

      {me && me.results.length > 0 && <section aria-labelledby="spin-history" className="rounded-xl border border-edge-subtle bg-surface-card p-6">
        <h2 id="spin-history" className="font-display text-xl font-bold mb-2">Your results</h2>
        <ul className="space-y-1 text-sm">
          {me.results.map(item => <li key={item.reference} className={item.voided_at ? 'line-through text-content-muted' : ''}>
            <span className="font-mono">{item.reference}</span>: {item.is_prize ? <strong>{item.prize_name}</strong> : item.segment_label}
            {item.is_prize && item.claimed_at ? ' (claimed)' : ''}{item.voided_at ? ' (voided)' : ''}
          </li>)}
        </ul>
      </section>}
    </div>
  </div>;
}

function BuySpins({ wheelName, priceCents, maxPerOrder, signedInAccount, authHeaders, onStarted }: {
  wheelName: string; priceCents: number; maxPerOrder: number; signedInAccount: boolean;
  authHeaders: () => Promise<Record<string, string>>; onStarted: (orderId: string, passToken: string | null) => void;
}) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', quantity: 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const startedAt = useRef(Date.now());
  const honeypot = useRef<HTMLInputElement>(null);
  const validQuantity = Number.isInteger(form.quantity) && form.quantity >= 1 && form.quantity <= maxPerOrder;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !validQuantity) return;
    setBusy(true); setError('');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(signedInAccount ? await authHeaders() : {}) };
      const response = await fetch('/api/spin-wheel/checkout', {
        method: 'POST', headers,
        body: JSON.stringify({ ...form, hp_field: honeypot.current?.value || '', submitted_at: startedAt.current }),
      });
      const created = await readJson(response);
      if (!response.ok || typeof created.order_id !== 'string') throw new Error(String(created.error || 'Checkout could not be started.'));
      onStarted(created.order_id, typeof created.pass_token === 'string' ? created.pass_token : null);
      const checkout = await fetch('/api/payments/checkout-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: created.order_id, return_path: SPIN_RETURN_PATH }),
      });
      const session = await readJson(checkout);
      if (!checkout.ok || typeof session.checkout_url !== 'string') throw new Error(String(session.error || 'Checkout could not be opened.'));
      const url = new URL(session.checkout_url);
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('Checkout is unavailable. Please try again shortly.');
      window.location.assign(url.href);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Checkout could not be started.');
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="rounded-xl border border-edge-subtle bg-surface-card p-6 space-y-4" aria-labelledby="spin-buy">
    <h2 id="spin-buy" className="font-display text-xl font-bold">Buy spins</h2>
    <p>{formatAud(priceCents)} AUD per spin on the {wheelName}. {signedInAccount ? 'Spins are added to your club account.' : 'We email you a spin link once payment is confirmed.'}</p>
    <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
      <legend className="sr-only">Your details</legend>
      <Input id="spin-buy-name" label="Name" required autoComplete="name" maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
      <Input id="spin-buy-email" label="Email" type="email" required autoComplete="email" maxLength={254} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
      <Input id="spin-buy-phone" label="Phone (optional)" type="tel" autoComplete="tel" maxLength={40} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
      <Input id="spin-buy-quantity" label="Number of spins" type="number" min={1} max={maxPerOrder} step={1} required value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} />
      <input ref={honeypot} type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
    </fieldset>
    <p className="font-bold" aria-live="polite">{validQuantity ? `Total: ${formatAud(form.quantity * priceCents)} AUD` : `Choose between 1 and ${maxPerOrder} spins.`}</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <Button type="submit" isLoading={busy} disabled={!validQuantity}>Pay securely with Stripe</Button>
  </form>;
}

function ResendLink() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/spin-wheel/pass/resend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const data = await readJson(response);
      setMessage(String(data.message || data.error || 'Please try again.'));
    } catch {
      setMessage('Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return <details className="rounded-xl border border-edge-subtle bg-surface-card p-6">
    <summary className="cursor-pointer font-semibold">Lost your spin link?</summary>
    <form onSubmit={submit} className="mt-4 space-y-3">
      <Input id="spin-resend-email" label="Email used to buy or receive spins" type="email" required autoComplete="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} />
      <Button type="submit" variant="secondary" isLoading={busy}>Email me my spin link</Button>
      {message && <p role="status">{message}</p>}
    </form>
  </details>;
}

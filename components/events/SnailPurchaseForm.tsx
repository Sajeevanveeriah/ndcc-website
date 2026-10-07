'use client';

import { useState, type FormEvent } from 'react';
import { Minus, Plus } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input, { Textarea } from '@/components/ui/Input';
import OrderPaymentOptions from '@/components/payments/OrderPaymentOptions';
import TurnstileWidget, { useTurnstile } from '@/components/common/TurnstileWidget';
import { formatCurrency, validateEmail, validatePhone } from '@/lib/utils';
import { SNAIL_RACE_LIMITS, parseBulkSnailLines, sponsoredRaceName } from '@/lib/events/snail-race';
import type { Event } from '@/lib/types';
import { raceSponsorshipPrice } from './SnailRaceDetails';

type OrderConfirmation = {
  order_id: string;
  customer_email: string;
  total_amount: number;
  payment_reference: string;
  bank_details: { account_name: string; bsb: string; account_number: string } | null;
};

const clamp = (value: number, max: number) => Math.min(max, Math.max(0, Math.floor(value) || 0));

function Stepper({ id, label, value, max, onChange }: { id: string; label: string; value: number; max: number; onChange: (value: number) => void }) {
  return (
    <div>
      <label htmlFor={id} className="form-label">{label}</label>
      <div className="flex items-center gap-2">
        <button type="button" aria-label={`Fewer: ${label}`} disabled={value <= 0} onClick={() => onChange(clamp(value - 1, max))}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-edge-strong text-content-primary disabled:opacity-40 focus-ring">
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        <input id={id} type="number" inputMode="numeric" min={0} max={max} value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value), max))}
          className="form-input w-20 text-center" />
        <button type="button" aria-label={`More: ${label}`} disabled={value >= max} onClick={() => onChange(clamp(value + 1, max))}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-edge-strong text-content-primary disabled:opacity-40 focus-ring">
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export default function SnailPurchaseForm({ event }: { event: Event }) {
  const price = Number(event.ticket_price) || 0;
  const sponsorPrice = raceSponsorshipPrice(event);
  const [buyer, setBuyer] = useState({ name: '', email: '', phone: '', hp_field: '', submitted_at: Date.now() });
  const [snails, setSnails] = useState<string[]>(['']);
  const [sponsorships, setSponsorships] = useState(0);
  const [sponsorName, setSponsorName] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [bulkMessage, setBulkMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [confirmation, setConfirmation] = useState<OrderConfirmation | null>(null);
  const turnstile = useTurnstile();

  const snailTotal = snails.length * price;
  const sponsorTotal = sponsorships * (sponsorPrice ?? 0);
  const total = snailTotal + sponsorTotal;
  const raceName = sponsoredRaceName(sponsorName);
  const setSnailCount = (count: number) => {
    const next = clamp(count, SNAIL_RACE_LIMITS.maxSnailsPerOrder);
    setSnails((prev) => (next <= prev.length ? prev.slice(0, next) : [...prev, ...Array.from({ length: next - prev.length }, () => '')]));
  };

  function addBulk() {
    const parsed = parseBulkSnailLines(bulkText);
    if (parsed.length === 0) {
      setBulkMessage('Add one snail name per line.');
      return;
    }
    // Keep the names already typed, then add the pasted ones.
    const kept = snails.filter((name) => name.trim());
    const room = SNAIL_RACE_LIMITS.maxSnailsPerOrder - kept.length;
    const added = parsed.slice(0, Math.max(0, room));
    setSnails([...kept, ...added]);
    setBulkText('');
    setBulkMessage(added.length < parsed.length
      ? `Added ${added.length} snails. One order holds up to ${SNAIL_RACE_LIMITS.maxSnailsPerOrder}; place another order for the rest.`
      : `Added ${added.length} ${added.length === 1 ? 'snail' : 'snails'}.`);
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (snails.length + sponsorships < 1) next.snails = 'Add at least one snail or sponsor a race.';
    const missing = snails.findIndex((name) => !name.trim());
    if (missing >= 0) next.snails = `Name snail ${missing + 1}, or remove it.`;
    const tooLong = snails.findIndex((name) => name.trim().length > SNAIL_RACE_LIMITS.snailNameLength);
    if (tooLong >= 0) next.snails = `Snail ${tooLong + 1} name must be ${SNAIL_RACE_LIMITS.snailNameLength} characters or fewer.`;
    if (sponsorships > 0 && !sponsorName.trim()) next.sponsor = 'Enter the sponsor name for your race.';
    if (!buyer.name.trim()) next.name = 'Name is required';
    if (!buyer.email.trim()) next.email = 'Email is required';
    else if (!validateEmail(buyer.email)) next.email = 'Please enter a valid email address';
    if (!buyer.phone.trim()) next.phone = 'Phone number is required';
    else if (!validatePhone(buyer.phone)) next.phone = 'Please enter a valid phone number';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validate()) return;
    if (!turnstile.check()) return;
    setSubmitting(true);
    setStatus('idle');
    setMessage('');
    setConfirmation(null);
    try {
      const body = JSON.stringify({
        event_id: event.id,
        name: buyer.name,
        email: buyer.email,
        phone: buyer.phone,
        snails: snails.map((name) => ({ snail_name: name.trim() })),
        race_sponsorships: sponsorships,
        ...(sponsorships > 0 ? { race_sponsor_name: sponsorName.trim() } : {}),
        hp_field: buyer.hp_field,
        submitted_at: buyer.submitted_at,
        turnstileToken: turnstile.token ?? undefined,
      });
      // Matches the server's 32 KB order limit (long names in some scripts take more bytes).
      if (new TextEncoder().encode(body).length > 32 * 1024) {
        throw new Error('This order is too large to send in one go. Please split your snails across two orders.');
      }
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) throw new Error(data?.error || 'Something went wrong. Please try again.');
      const totalAmount = Number(data.total_amount || 0);
      setStatus('success');
      setMessage(totalAmount > 0
        ? 'Your order is in. Choose how you will pay below: card online, at the club, or bank transfer.'
        : 'Your order is in. No payment is required.');
      if (data.order_id && totalAmount > 0) {
        setConfirmation({
          order_id: data.order_id,
          total_amount: totalAmount,
          payment_reference: data.payment_reference || '',
          bank_details: data.bank_details || null,
          customer_email: buyer.email,
        });
      }
      setBuyer({ name: '', email: '', phone: '', hp_field: '', submitted_at: Date.now() });
      setSnails(['']);
      setSponsorships(0);
      setSponsorName('');
      setErrors({});
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
      turnstile.reset();
    }
  }

  const buttonLabel = submitting
    ? 'Saving...'
    : total > 0
      ? `Continue to payment: ${formatCurrency(total)}`
      : snails.length > 0 ? `Enter ${snails.length} ${snails.length === 1 ? 'snail' : 'snails'}` : 'Enter';

  return (
    <div className="space-y-4" data-testid="snail-purchase-form">
      {status === 'success' && (
        <div className="p-3 rounded-xl border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/40" role="status">
          <p className="text-green-800 dark:text-green-200 font-body font-semibold text-sm">Thanks, your snails are in</p>
          <p className="text-green-700 dark:text-green-300 font-body text-xs mt-1">{message}</p>
        </div>
      )}
      {status === 'success' && confirmation && (
        <OrderPaymentOptions
          orderId={confirmation.order_id}
          customerEmail={confirmation.customer_email}
          totalAmount={confirmation.total_amount}
          paymentReference={confirmation.payment_reference}
          bankDetails={confirmation.bank_details}
          returnPath={`/events/${event.id}`}
        />
      )}
      {status === 'error' && (
        <div className="p-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40" role="alert">
          <p className="text-red-800 dark:text-red-200 font-body font-semibold text-sm">Your order did not go through</p>
          <p className="text-red-700 dark:text-red-300 font-body text-xs mt-1">{message}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <input
          type="text"
          name="website"
          value={buyer.hp_field}
          onChange={(e) => setBuyer((prev) => ({ ...prev, hp_field: e.target.value }))}
          className="hidden"
          tabIndex={-1}
          autoComplete="off"
        />

        <fieldset className="space-y-3">
          <legend className="font-display text-lg font-semibold text-content-primary">1. Your snails</legend>
          <Stepper id="snail_count" label={`How many snails? (${formatCurrency(price)} each)`} value={snails.length}
            max={SNAIL_RACE_LIMITS.maxSnailsPerOrder} onChange={setSnailCount} />
          {snails.length > 0 && (
            <p className="text-xs text-content-muted">
              Name each snail, up to {SNAIL_RACE_LIMITS.snailNameLength} characters. Be creative; offensive or inappropriate names will not be accepted.
            </p>
          )}
          {snails.map((name, index) => (
            <div key={index} className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  id={`snail_name_${index}`}
                  label={`Snail ${index + 1} name`}
                  type="text"
                  required
                  maxLength={SNAIL_RACE_LIMITS.snailNameLength}
                  value={name}
                  onChange={(e) => setSnails((prev) => prev.map((value, i) => (i === index ? e.target.value : value)))}
                />
              </div>
              <button
                type="button"
                aria-label={`Remove snail ${index + 1}`}
                className="mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-maroon-700 dark:text-maroon-200 hover:bg-surface-muted focus-ring"
                onClick={() => setSnails((prev) => prev.filter((_, i) => i !== index))}
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
          <details className="rounded-2xl border border-edge-subtle p-3">
            <summary className="cursor-pointer text-sm font-semibold text-content-primary">Buying lots of snails? Paste a list of names</summary>
            <div className="mt-3 space-y-2">
              <Textarea
                id="snail_bulk"
                label="One snail name per line"
                rows={5}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
              />
              <Button type="button" variant="secondary" className="w-full" onClick={addBulk}>Add these snails</Button>
              {bulkMessage && <p className="text-xs text-content-muted" aria-live="polite">{bulkMessage}</p>}
            </div>
          </details>
          {errors.snails && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{errors.snails}</p>}
        </fieldset>

        {sponsorPrice !== null && (
          <fieldset className="space-y-3">
            <legend className="font-display text-lg font-semibold text-content-primary">2. Sponsor a race (optional)</legend>
            <p className="text-xs text-content-muted">
              {sponsorPrice > 0 ? `${formatCurrency(sponsorPrice)} per race. ` : ''}Each sponsored race is named after its sponsor, for example The Jack Elliott Stakes.
            </p>
            <Stepper id="snail_sponsorships" label="Races to sponsor" value={sponsorships}
              max={SNAIL_RACE_LIMITS.maxSponsorshipsPerOrder} onChange={setSponsorships} />
            {sponsorships > 0 && (
              <>
                <Input
                  id="snail_sponsor_name"
                  label="Sponsor name"
                  type="text"
                  required
                  maxLength={SNAIL_RACE_LIMITS.sponsorNameLength}
                  value={sponsorName}
                  error={errors.sponsor}
                  onChange={(e) => setSponsorName(e.target.value)}
                />
                {raceName && <p className="text-sm text-content-secondary" aria-live="polite">Race name: <strong>{raceName}</strong></p>}
              </>
            )}
          </fieldset>
        )}

        <fieldset className="space-y-3">
          <legend className="font-display text-lg font-semibold text-content-primary">{sponsorPrice !== null ? '3.' : '2.'} Your details</legend>
          <Input id="snail_buyer_name" label="Your name" type="text" required value={buyer.name} error={errors.name}
            onChange={(e) => setBuyer((prev) => ({ ...prev, name: e.target.value }))} />
          <Input id="snail_buyer_email" label="Email address" type="email" required value={buyer.email} error={errors.email}
            onChange={(e) => setBuyer((prev) => ({ ...prev, email: e.target.value }))} />
          <Input id="snail_buyer_phone" label="Phone number" type="tel" required value={buyer.phone} error={errors.phone}
            onChange={(e) => setBuyer((prev) => ({ ...prev, phone: e.target.value }))} />
        </fieldset>

        <div className="rounded-2xl bg-surface-muted p-4 space-y-1 text-sm" aria-live="polite" data-testid="snail-order-summary">
          {snails.length > 0 && (
            <p className="flex justify-between gap-3"><span>{snails.length} {snails.length === 1 ? 'snail' : 'snails'}</span><span>{formatCurrency(snailTotal)}</span></p>
          )}
          {sponsorships > 0 && sponsorPrice !== null && (
            <p className="flex justify-between gap-3"><span>{sponsorships} race {sponsorships === 1 ? 'sponsorship' : 'sponsorships'}</span><span>{formatCurrency(sponsorTotal)}</span></p>
          )}
          <p className="flex justify-between gap-3 border-t border-edge-subtle pt-2 font-semibold text-content-primary text-[15px]">
            <span>Total</span><span>{formatCurrency(total)}</span>
          </p>
        </div>

        <TurnstileWidget onToken={turnstile.setToken} resetKey={turnstile.resetKey} action="snail-race" message={turnstile.message} />

        <Button type="submit" isLoading={submitting} className="w-full">{buttonLabel}</Button>
        <p className="text-xs text-content-muted text-center">You choose how to pay on the next step.</p>
      </form>
    </div>
  );
}

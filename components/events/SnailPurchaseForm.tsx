'use client';

import { useState, type FormEvent } from 'react';
import Button from '@/components/ui/Button';
import Input, { Textarea } from '@/components/ui/Input';
import OrderPaymentOptions from '@/components/payments/OrderPaymentOptions';
import { formatCurrency, validateEmail, validatePhone } from '@/lib/utils';
import { SNAIL_RACE_LIMITS, parseBulkSnailLines } from '@/lib/events/snail-race';
import type { Event } from '@/lib/types';
import { raceSponsorshipPrice } from './SnailRaceDetails';

type SnailRow = { snail_name: string; player_name: string };
type OrderConfirmation = {
  order_id: string;
  customer_email: string;
  total_amount: number;
  payment_reference: string;
  bank_details: { account_name: string; bsb: string; account_number: string } | null;
};

const emptySnail = (): SnailRow => ({ snail_name: '', player_name: '' });
const clampCount = (value: number) => Math.min(SNAIL_RACE_LIMITS.maxSnailsPerOrder, Math.max(0, Math.floor(value) || 0));

export default function SnailPurchaseForm({ event }: { event: Event }) {
  const price = Number(event.ticket_price) || 0;
  const sponsorPrice = raceSponsorshipPrice(event);
  const [buyer, setBuyer] = useState({ name: '', email: '', phone: '', hp_field: '', submitted_at: Date.now() });
  const [snails, setSnails] = useState<SnailRow[]>([emptySnail()]);
  const [sponsorships, setSponsorships] = useState(0);
  const [bulkText, setBulkText] = useState('');
  const [bulkMessage, setBulkMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [confirmation, setConfirmation] = useState<OrderConfirmation | null>(null);

  const total = snails.length * price + sponsorships * (sponsorPrice ?? 0);
  const updateSnail = (index: number, patch: Partial<SnailRow>) =>
    setSnails((prev) => prev.map((snail, i) => (i === index ? { ...snail, ...patch } : snail)));
  const setSnailCount = (count: number) => {
    const next = clampCount(count);
    setSnails((prev) => (next <= prev.length ? prev.slice(0, next) : [...prev, ...Array.from({ length: next - prev.length }, emptySnail)]));
  };

  function addBulk() {
    const parsed = parseBulkSnailLines(bulkText);
    if (parsed.length === 0) {
      setBulkMessage('Add one snail per line, for example: Turbo, Jane Smith');
      return;
    }
    // Fill empty rows first, then add rows for the rest.
    const kept = snails.filter((snail) => snail.snail_name.trim() || snail.player_name.trim());
    const room = SNAIL_RACE_LIMITS.maxSnailsPerOrder - kept.length;
    const added = parsed.slice(0, Math.max(0, room));
    setSnails([...kept, ...added]);
    setBulkText('');
    setBulkMessage(added.length < parsed.length
      ? `Added ${added.length} snails. This order holds up to ${SNAIL_RACE_LIMITS.maxSnailsPerOrder}; place another order for the rest.`
      : `Added ${added.length} ${added.length === 1 ? 'snail' : 'snails'}.`);
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!buyer.name.trim()) next.name = 'Name is required';
    if (!buyer.email.trim()) next.email = 'Email is required';
    else if (!validateEmail(buyer.email)) next.email = 'Please enter a valid email address';
    if (!buyer.phone.trim()) next.phone = 'Phone number is required';
    else if (!validatePhone(buyer.phone)) next.phone = 'Please enter a valid phone number';
    if (snails.length + sponsorships < 1) next.snails = 'Add at least one snail or race sponsorship.';
    const missing = snails.findIndex((snail) => !snail.snail_name.trim());
    if (missing >= 0) next.snails = `Enter a name for snail ${missing + 1}, or remove it.`;
    const tooLong = snails.findIndex((snail) => snail.snail_name.trim().length > SNAIL_RACE_LIMITS.snailNameLength);
    if (tooLong >= 0) next.snails = `Snail ${tooLong + 1} name must be ${SNAIL_RACE_LIMITS.snailNameLength} characters or fewer.`;
    const longPlayer = snails.findIndex((snail) => snail.player_name.trim().length > SNAIL_RACE_LIMITS.playerNameLength);
    if (longPlayer >= 0) next.snails = `Snail ${longPlayer + 1} player name must be ${SNAIL_RACE_LIMITS.playerNameLength} characters or fewer.`;
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validate()) return;
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
        snails: snails.map((snail) => ({ snail_name: snail.snail_name.trim(), player_name: snail.player_name.trim() })),
        race_sponsorships: sponsorships,
        hp_field: buyer.hp_field,
        submitted_at: buyer.submitted_at,
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
        ? 'Your snails are recorded. Choose how you will pay below: card online, at the club, or bank transfer.'
        : 'Your snails are recorded. No payment is required.');
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
      setSnails([emptySnail()]);
      setSponsorships(0);
      setErrors({});
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  }

  const summary = [
    snails.length > 0 ? `${snails.length} ${snails.length === 1 ? 'snail' : 'snails'} x ${formatCurrency(price)}` : '',
    sponsorships > 0 && sponsorPrice !== null ? `${sponsorships} race ${sponsorships === 1 ? 'sponsorship' : 'sponsorships'} x ${formatCurrency(sponsorPrice)}` : '',
  ].filter(Boolean).join(' + ');

  return (
    <div className="space-y-4" data-testid="snail-purchase-form">
      {status === 'success' && (
        <div className="p-3 rounded-xl border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/40" role="status">
          <p className="text-green-800 dark:text-green-200 font-body font-semibold text-sm">Snails bought</p>
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
          <p className="text-red-800 dark:text-red-200 font-body font-semibold text-sm">Purchase failed</p>
          <p className="text-red-700 dark:text-red-300 font-body text-xs mt-1">{message}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <input
          type="text"
          name="website"
          value={buyer.hp_field}
          onChange={(e) => setBuyer((prev) => ({ ...prev, hp_field: e.target.value }))}
          className="hidden"
          tabIndex={-1}
          autoComplete="off"
        />
        <Input id="snail_buyer_name" label="Your Name" type="text" required placeholder="e.g. Jane Smith" value={buyer.name} error={errors.name}
          onChange={(e) => setBuyer((prev) => ({ ...prev, name: e.target.value }))} />
        <Input id="snail_buyer_email" label="Email Address" type="email" required placeholder="e.g. jane@example.com" value={buyer.email} error={errors.email}
          onChange={(e) => setBuyer((prev) => ({ ...prev, email: e.target.value }))} />
        <Input id="snail_buyer_phone" label="Phone Number" type="tel" required placeholder="e.g. 0412 345 678" value={buyer.phone} error={errors.phone}
          onChange={(e) => setBuyer((prev) => ({ ...prev, phone: e.target.value }))} />

        <fieldset className="w-full space-y-3">
          <legend className="form-label mb-2">Your snails</legend>
          <Input
            id="snail_count"
            label="Number of snails"
            type="number"
            min={0}
            max={SNAIL_RACE_LIMITS.maxSnailsPerOrder}
            value={snails.length}
            onChange={(e) => setSnailCount(Number(e.target.value))}
          />
          <p className="text-xs text-content-muted">
            Name each snail (up to {SNAIL_RACE_LIMITS.snailNameLength} characters). Leave a player name blank to use your name.
          </p>
          {snails.map((snail, index) => (
            <div key={index} className="rounded-2xl border border-edge-subtle bg-surface-muted p-3 space-y-2">
              <Input
                id={`snail_name_${index}`}
                label={`Snail ${index + 1} name`}
                type="text"
                required
                maxLength={SNAIL_RACE_LIMITS.snailNameLength}
                value={snail.snail_name}
                onChange={(e) => updateSnail(index, { snail_name: e.target.value })}
              />
              <Input
                id={`snail_player_${index}`}
                label={`Snail ${index + 1} player name`}
                type="text"
                maxLength={SNAIL_RACE_LIMITS.playerNameLength}
                placeholder={buyer.name.trim() || 'Your name'}
                value={snail.player_name}
                onChange={(e) => updateSnail(index, { player_name: e.target.value })}
              />
              <button
                type="button"
                className="min-h-11 text-sm text-maroon-700 dark:text-maroon-200 underline underline-offset-4"
                onClick={() => setSnails((prev) => prev.filter((_, i) => i !== index))}
              >
                Remove snail {index + 1}
              </button>
            </div>
          ))}
          {snails.length < SNAIL_RACE_LIMITS.maxSnailsPerOrder ? (
            <Button type="button" variant="secondary" className="w-full" onClick={() => setSnails((prev) => [...prev, emptySnail()])}>
              Add another snail
            </Button>
          ) : (
            <p className="text-sm text-content-muted">This order has the maximum of {SNAIL_RACE_LIMITS.maxSnailsPerOrder} snails. Place another order for more.</p>
          )}
          <details className="rounded-2xl border border-edge-subtle p-3">
            <summary className="cursor-pointer text-sm font-semibold text-content-primary">Buying lots of snails? Paste a list</summary>
            <div className="mt-3 space-y-2">
              <Textarea
                id="snail_bulk"
                label="One snail per line: snail name, player name"
                rows={5}
                placeholder={'Turbo, Jane Smith\nSlow Coach, The Smith Kids'}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
              />
              <Button type="button" variant="secondary" className="w-full" onClick={addBulk}>Add these snails</Button>
              {bulkMessage && <p className="text-xs text-content-muted" aria-live="polite">{bulkMessage}</p>}
            </div>
          </details>
        </fieldset>

        {sponsorPrice !== null && (
          <Input
            id="snail_sponsorships"
            label={`Races to sponsor (${formatCurrency(sponsorPrice)} each, optional)`}
            type="number"
            min={0}
            max={SNAIL_RACE_LIMITS.maxSponsorshipsPerOrder}
            value={sponsorships}
            onChange={(e) => setSponsorships(Math.min(SNAIL_RACE_LIMITS.maxSponsorshipsPerOrder, Math.max(0, Math.floor(Number(e.target.value)) || 0)))}
          />
        )}

        <p className="font-body font-semibold text-content-primary text-[15px]" aria-live="polite">
          {summary ? `${summary} = ${formatCurrency(total)}` : 'Nothing added yet'}
        </p>
        {errors.snails && <p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">{errors.snails}</p>}

        <Button type="submit" isLoading={submitting} className="w-full">
          {submitting
            ? 'Saving...'
            : total > 0
              ? `Buy ${snails.length > 0 ? `${snails.length} ${snails.length === 1 ? 'snail' : 'snails'}` : 'race sponsorship'} and choose payment`
              : 'Enter snails'}
        </Button>
      </form>
    </div>
  );
}

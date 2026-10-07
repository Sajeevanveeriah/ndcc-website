'use client';

import { eventVenue } from '@/lib/event-venue';
import { useState, FormEvent } from 'react';
import Link from 'next/link';
import SafeImage from '@/components/common/SafeImage';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import OrderPaymentOptions from '@/components/payments/OrderPaymentOptions';
import { Event } from '@/lib/types';
import { formatDateTime, formatCurrency, validateEmail, validatePhone } from '@/lib/utils';
import { normalizeEventImage } from '@/lib/public-content-normalizers';
import { EVENT_SONG_LIMITS, isSongRequestEvent } from '@/lib/events/song-requests';
import { isSnailRaceEvent } from '@/lib/events/snail-race';
import SnailRaceDetails, { raceSponsorshipPrice } from '@/components/events/SnailRaceDetails';
import SnailPurchaseForm from '@/components/events/SnailPurchaseForm';
import TurnstileWidget, { useTurnstile } from '@/components/common/TurnstileWidget';

const CLUB_TIME_ZONE = 'Australia/Melbourne';
const dayFormat = new Intl.DateTimeFormat('en-AU', { timeZone: CLUB_TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('en-AU', { timeZone: CLUB_TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true });

type OrderConfirmation = {
  order_id: string;
  customer_email: string;
  total_amount: number;
  payment_reference: string;
  bank_details: { account_name: string; bsb: string; account_number: string } | null;
};

export default function EventDetailClient({ event }: { event: Event }) {
  const eventId = event.id;
  const songEvent = isSongRequestEvent(event);
  const snailEvent = isSnailRaceEvent(event);
  const sponsorPrice = snailEvent ? raceSponsorshipPrice(event) : null;
  // Off when the club takes registrations and payments manually for this event.
  const onlineRegistration = event.online_registration_enabled !== false;
  const [songs, setSongs] = useState([{ title: '', artist: '' }]);
  const songTotal = songs.length * event.ticket_price;
  const updateSong = (index: number, patch: Partial<{ title: string; artist: string }>) =>
    setSongs((prev) => prev.map((song, i) => (i === index ? { ...song, ...patch } : song)));

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    quantity: 1,
    hp_field: '',
    submitted_at: Date.now(),
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [orderConfirmation, setOrderConfirmation] = useState<OrderConfirmation | null>(null);
  const turnstile = useTurnstile();

  function validateForm(): boolean {
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) errors.name = 'Name is required';
    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!validateEmail(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }
    if (!formData.phone.trim()) {
      errors.phone = 'Phone number is required';
    } else if (!validatePhone(formData.phone)) {
      errors.phone = 'Please enter a valid phone number';
    }
    if (songEvent) {
      const missing = songs.findIndex((song) => !song.title.trim());
      if (missing >= 0) errors.songs = `Enter a title for song ${missing + 1}, or remove it.`;
    } else {
      if (formData.quantity < 1) errors.quantity = 'Quantity must be at least 1';
      if (formData.quantity > 20) errors.quantity = 'Maximum 20 tickets per registration';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validateForm()) return;
    if (!turnstile.check()) return;

    setIsSubmitting(true);
    setSubmitStatus('idle');
    setErrorMessage('');
    setOrderConfirmation(null);

    try {
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          ...(songEvent
            ? { songs: songs.map((song) => ({ title: song.title.trim(), artist: song.artist.trim() })) }
            : { quantity: formData.quantity }),
          hp_field: formData.hp_field,
          submitted_at: formData.submitted_at,
          turnstileToken: turnstile.token ?? undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Something went wrong. Please try again.');
      }

      const data = await response.json();
      const totalAmount = Number(data.total_amount || 0);
      setSubmitStatus('success');
      setErrorMessage(totalAmount > 0
        ? 'Registration confirmed. Choose secure card payment or bank transfer below.'
        : 'Registration confirmed. No payment is required.');
      if (data.order_id && totalAmount > 0) {
        setOrderConfirmation({
          order_id: data.order_id,
          total_amount: totalAmount,
          payment_reference: data.payment_reference || '',
          bank_details: data.bank_details || null,
          customer_email: formData.email,
        });
      }
      setFormData({ name: '', email: '', phone: '', quantity: 1, hp_field: '', submitted_at: Date.now() });
      setSongs([{ title: '', artist: '' }]);
      setFormErrors({});
    } catch (err) {
      setSubmitStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
      turnstile.reset();
    }
  }

  const imageUrl = normalizeEventImage(event.title, event.image_url);
  const venue = eventVenue(event.location);
  const eventDate = new Date(event.date);
  const hasValidDate = Number.isFinite(eventDate.getTime());
  const priceLabel = event.ticket_price === 0 ? 'Free entry' : `${formatCurrency(event.ticket_price)}${songEvent ? ' per song' : snailEvent ? ' per snail' : ''}`;
  const heroDetails = [
    hasValidDate ? dayFormat.format(eventDate) : '',
    hasValidDate ? timeFormat.format(eventDate) : '',
    event.location,
    priceLabel,
  ].filter(Boolean);

  return (
    <>
      <section className="page-hero px-0 sm:px-0 lg:px-0">
        <div className="nd-wrap">
          <nav aria-label="Breadcrumb" className="nd-crumbs">
            <Link href="/">Home</Link> / <Link href="/events">Events</Link> / <span aria-current="page">{event.title}</span>
          </nav>
          <h1 className="page-hero-title">{event.title}</h1>
          <p className="page-hero-subtitle">{heroDetails.join(' · ')}</p>
        </div>
      </section>

      <section className="nd-sec-tight">
        <div className="nd-wrap nd-two-col">
          <article className="nd-card overflow-hidden">
            {imageUrl && (
              <div className="nd-poster">
                <div className="relative h-[340px] w-full lg:h-[420px]">
                  <SafeImage
                    src={imageUrl}
                    alt={`${event.title} event artwork`}
                    fill
                    priority
                    className="object-contain h-full! w-full! max-h-full! shadow-none!"
                    sizes="(max-width: 980px) 100vw, 640px"
                    fallback={<div className="absolute inset-0 bg-surface-muted" aria-hidden="true" />}
                  />
                </div>
              </div>
            )}
            <div className="nd-event-body">
              <h2 className="text-2xl!">About the event</h2>
              {event.description && (
                <p className="font-body text-content-secondary text-[17px] leading-relaxed whitespace-pre-line">
                  {event.description}
                </p>
              )}
              <dl className="nd-facts">
                <dt>When</dt>
                <dd>{formatDateTime(event.date)}</dd>
                <dt>Where</dt>
                <dd>
                  {event.location}
                  {venue.address && (
                    <span className="block font-normal text-content-secondary">
                      {venue.address.streetAddress}, {venue.address.addressLocality} VIC {venue.address.postalCode}
                    </span>
                  )}
                </dd>
                <dt>{songEvent ? 'Price per song' : snailEvent ? 'Price per snail' : 'Ticket price'}</dt>
                <dd>{priceLabel}</dd>
                {sponsorPrice !== null && (
                  <>
                    <dt>Sponsor a race</dt>
                    <dd>{sponsorPrice > 0 ? formatCurrency(sponsorPrice) : 'Free'}</dd>
                  </>
                )}
                {/* Snail sales are unlimited, so capacity is never shown for them. */}
                {!snailEvent && event.capacity && (
                  <>
                    <dt>Capacity</dt>
                    <dd>{event.capacity} places</dd>
                  </>
                )}
              </dl>
              {songEvent && <p className="font-body text-content-muted text-sm">Entry is by buying songs. Choose at least one; there is no limit on how many you buy.</p>}
              {snailEvent && <SnailRaceDetails event={event} />}
            </div>
          </article>

          <aside className="nd-card p-6 sm:p-[26px] min-[981px]:sticky min-[981px]:top-[120px]" aria-labelledby="event-register-title">
            <h2 id="event-register-title" className="font-display text-[22px] font-semibold tracking-[-0.02em] text-content-primary">{snailEvent ? 'Buy snails' : 'Register'}</h2>
            <p className="mt-1 mb-5 font-body text-[14.5px] text-content-muted">{priceLabel}</p>

            {!onlineRegistration ? (
              <p className="font-body text-[14.5px] text-content-secondary" data-testid="event-offline-registration">
                {snailEvent
                  ? 'Snail purchases and payment for this event are handled by the club, not online. See the event details for how to take part.'
                  : 'Registration and payment for this event are handled by the club, not online. See the event details for how to take part.'}
              </p>
            ) : snailEvent ? (
              <SnailPurchaseForm event={event} />
            ) : (
            <div className="space-y-4">
              {submitStatus === 'success' && (
                <div className="p-3 rounded-xl border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/40" role="status">
                  <p className="text-green-800 dark:text-green-200 font-body font-semibold text-sm">Registration confirmed</p>
                  <p className="text-green-700 dark:text-green-300 font-body text-xs mt-1">{errorMessage}</p>
                </div>
              )}

              {submitStatus === 'success' && orderConfirmation && (
                <OrderPaymentOptions
                  orderId={orderConfirmation.order_id}
                  customerEmail={orderConfirmation.customer_email}
                  totalAmount={orderConfirmation.total_amount}
                  paymentReference={orderConfirmation.payment_reference}
                  bankDetails={orderConfirmation.bank_details}
                  returnPath={`/events/${eventId}`}
                />
              )}

              {submitStatus === 'error' && (
                <div className="p-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40" role="alert">
                  <p className="text-red-800 dark:text-red-200 font-body font-semibold text-sm">Registration failed</p>
                  <p className="text-red-700 dark:text-red-300 font-body text-xs mt-1">{errorMessage}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <input
                  type="text"
                  name="website"
                  value={formData.hp_field}
                  onChange={(e) => setFormData((prev) => ({ ...prev, hp_field: e.target.value }))}
                  className="hidden"
                  tabIndex={-1}
                  autoComplete="off"
                />
                <Input
                  id="reg_name"
                  label="Your Name"
                  type="text"
                  required
                  placeholder="e.g. Jane Smith"
                  value={formData.name}
                  error={formErrors.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                />
                <Input
                  id="reg_email"
                  label="Email Address"
                  type="email"
                  required
                  placeholder="e.g. jane@example.com"
                  value={formData.email}
                  error={formErrors.email}
                  onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                />
                <Input
                  id="reg_phone"
                  label="Phone Number"
                  type="tel"
                  required
                  placeholder="e.g. 0412 345 678"
                  value={formData.phone}
                  error={formErrors.phone}
                  onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                />

                {songEvent ? (
                  <fieldset className="w-full space-y-3">
                    <legend className="form-label mb-5">Your songs</legend>
                    {songs.map((song, index) => (
                      <div key={index} className="rounded-2xl border border-edge-subtle bg-surface-muted p-3 space-y-2">
                        <Input
                          id={`song_title_${index}`}
                          label={`Song ${index + 1} title`}
                          type="text"
                          required
                          maxLength={EVENT_SONG_LIMITS.titleLength}
                          value={song.title}
                          onChange={(e) => updateSong(index, { title: e.target.value })}
                        />
                        <Input
                          id={`song_artist_${index}`}
                          label={`Song ${index + 1} artist (optional)`}
                          type="text"
                          maxLength={EVENT_SONG_LIMITS.artistLength}
                          value={song.artist}
                          onChange={(e) => updateSong(index, { artist: e.target.value })}
                        />
                        {songs.length > 1 && (
                          <button
                            type="button"
                            className="min-h-11 text-sm text-maroon-700 dark:text-maroon-200 underline underline-offset-4"
                            onClick={() => setSongs((prev) => prev.filter((_, i) => i !== index))}
                          >
                            Remove song {index + 1}
                          </button>
                        )}
                      </div>
                    ))}
                    {songs.length < EVENT_SONG_LIMITS.maxSongs ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full"
                        onClick={() => setSongs((prev) => [...prev, { title: '', artist: '' }])}
                      >
                        Add another song
                      </Button>
                    ) : (
                      <p className="text-sm text-content-muted">This order has the maximum of {EVENT_SONG_LIMITS.maxSongs} songs. Place another order for more.</p>
                    )}
                    <p className="font-body font-semibold text-content-primary text-[15px]" aria-live="polite">
                      {songs.length} {songs.length === 1 ? 'song' : 'songs'} x {formatCurrency(event.ticket_price)} = {formatCurrency(songTotal)}
                    </p>
                    {formErrors.songs && (
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">{formErrors.songs}</p>
                    )}
                  </fieldset>
                ) : (
                <div className="w-full">
                  <label htmlFor="reg_quantity" className="form-label">Quantity</label>
                  <input
                    id="reg_quantity"
                    type="number"
                    min={1}
                    max={20}
                    required
                    className="form-input"
                    value={formData.quantity}
                    onChange={(e) => setFormData((prev) => ({
                      ...prev,
                      quantity: Math.max(1, parseInt(e.target.value) || 1),
                    }))}
                  />
                  {formErrors.quantity && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{formErrors.quantity}</p>
                  )}
                </div>
                )}

                <TurnstileWidget onToken={turnstile.setToken} resetKey={turnstile.resetKey} action="event-registration" message={turnstile.message} />

                <Button type="submit" isLoading={isSubmitting} className="w-full">
                  {isSubmitting
                    ? 'Registering...'
                    : event.ticket_price > 0
                      ? songEvent ? `Buy ${songs.length} ${songs.length === 1 ? 'song' : 'songs'} and choose payment` : 'Register and choose payment'
                      : 'Register Now'}
                </Button>
              </form>
            </div>
            )}
          </aside>
        </div>
      </section>
    </>
  );
}

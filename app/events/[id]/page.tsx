'use client';

import { useState, useEffect, FormEvent } from 'react';
import Link from 'next/link';
import SafeImage from '@/components/common/SafeImage';
import { useParams } from 'next/navigation';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import { Event } from '@/lib/types';
import { formatDateTime, formatCurrency, validateEmail, validatePhone } from '@/lib/utils';
import { normalizeEventImage } from '@/lib/public-content-normalizers';

export default function EventDetailPage() {
  const params = useParams();
  const eventId = params.id as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    quantity: 1,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    async function fetchEvent() {
      try {
        const res = await fetch(`/api/public/events?id=${encodeURIComponent(eventId)}`, { cache: 'no-store' });
        const json = await res.json();

        if (res.ok && json.data) {
          setEvent(json.data as Event);
          document.title = `${json.data.title} | NDCC Dinos`;
          setLoading(false);
          return;
        }

        setNotFound(true);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }

    fetchEvent();
  }, [eventId]);

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
    if (formData.quantity < 1) errors.quantity = 'Quantity must be at least 1';
    if (formData.quantity > 20) errors.quantity = 'Maximum 20 tickets per registration';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    setSubmitStatus('idle');
    setErrorMessage('');

    try {
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          quantity: formData.quantity,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Something went wrong. Please try again.');
      }

      const data = await response.json();
      setSubmitStatus('success');
      const paymentHelp = data?.payment_reference ? ` Payment reference: ${data.payment_reference}.` : '';
      const bankHelp = data?.bank_details?.bsb ? ` Bank transfer: ${data.bank_details.account_name}, BSB ${data.bank_details.bsb}, Account ${data.bank_details.account_number}.` : '';
      setErrorMessage(`Registration confirmed.${paymentHelp}${bankHelp} Example reference format: NDCC-YYYYMMDD-1234`);
      setFormData({ name: '', email: '', phone: '', quantity: 1 });
      setFormErrors({});
    } catch (err) {
      setSubmitStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loading) {
    return (
      <>
        <section className="page-hero">
          <div className="container-width">
            <div className="h-10 bg-maroon-600 rounded w-2/3 animate-pulse" />
          </div>
        </section>
        <section className="section-padding">
          <div className="container-width max-w-3xl mx-auto space-y-4">
            <div className="h-4 bg-gray-200 rounded w-1/3 animate-pulse" />
            <div className="h-4 bg-gray-200 rounded w-full animate-pulse" />
            <div className="h-4 bg-gray-200 rounded w-5/6 animate-pulse" />
            <div className="h-4 bg-gray-200 rounded w-2/3 animate-pulse" />
          </div>
        </section>
      </>
    );
  }

  if (notFound || !event) {
    return (
      <>
        <section className="page-hero">
          <div className="container-width">
            <h1 className="page-hero-title">Event Not Found</h1>
            <p className="page-hero-subtitle">
              The event you&apos;re looking for doesn&apos;t exist or has been removed.
            </p>
          </div>
        </section>
        <section className="section-padding">
          <div className="container-width text-center">
            <Link href="/events" className="btn-primary">
              Back to Events
            </Link>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      {/* Hero */}
      <section className="page-hero">
        <div className="container-width">
          <Link
            href="/events"
            className="inline-flex items-center text-maroon-200 hover:text-white font-body text-sm mb-4 transition-colors"
          >
            <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            Back to Events
          </Link>
          <h1 className="page-hero-title">{event.title}</h1>
          <p className="page-hero-subtitle">{formatDateTime(event.date)}</p>
        </div>
      </section>

      {/* Event Details */}
      <section className="section-padding">
        <div className="container-width">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            {/* Main Content */}
            <div className="lg:col-span-2">
              {normalizeEventImage(event.title, event.image_url) && (
                <div className="relative h-72 sm:h-96 w-full rounded-xl overflow-hidden mb-6">
                  <SafeImage
                    src={normalizeEventImage(event.title, event.image_url) || '/images/Womens_Team.jpg'}
                    alt={event.title}
                    fill
                    className="object-contain bg-gray-50"
                    sizes="(max-width: 1024px) 100vw, 66vw"
                    fallback={<div className="absolute inset-0 bg-gray-50" aria-hidden="true" />}
                  />
                </div>
              )}
              <div className="prose max-w-none">
                <p className="font-body text-gray-700 text-lg leading-relaxed whitespace-pre-line">
                  {event.description}
                </p>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Event Info Card */}
              <Card>
                <CardContent className="p-6 space-y-4">
                  <h3 className="font-display font-bold text-gray-900 text-lg">Event Details</h3>

                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-maroon-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                    </svg>
                    <div>
                      <p className="font-body font-semibold text-gray-900 text-sm">Date & Time</p>
                      <p className="font-body text-gray-600 text-sm">{formatDateTime(event.date)}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-maroon-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                    </svg>
                    <div>
                      <p className="font-body font-semibold text-gray-900 text-sm">Location</p>
                      <p className="font-body text-gray-600 text-sm">{event.location}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-maroon-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
                    </svg>
                    <div>
                      <p className="font-body font-semibold text-gray-900 text-sm">Ticket Price</p>
                      <Badge variant={event.ticket_price === 0 ? 'success' : 'default'}>
                        {event.ticket_price === 0 ? 'Free Entry' : formatCurrency(event.ticket_price)}
                      </Badge>
                    </div>
                  </div>

                  {event.capacity && (
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-maroon-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                      </svg>
                      <div>
                        <p className="font-body font-semibold text-gray-900 text-sm">Capacity</p>
                        <p className="font-body text-gray-600 text-sm">{event.capacity} places</p>
                      </div>
                    </div>
                  )}

                  {event.stripe_link && (
                    <a
                      href={event.stripe_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-primary w-full text-center mt-4"
                    >
                      Purchase Tickets
                    </a>
                  )}
                </CardContent>
              </Card>

              {/* Registration Form */}
              <Card>
                <CardContent className="p-6">
                  <h3 className="font-display font-bold text-gray-900 text-lg mb-4">Register</h3>

                  {submitStatus === 'success' && (
                    <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg" role="alert">
                      <p className="text-green-800 font-body font-semibold text-sm">
                        Registration confirmed!
                      </p>
                      <p className="text-green-700 font-body text-xs mt-1">{errorMessage || 'You will receive a confirmation email shortly.'}</p>
                    </div>
                  )}

                  {submitStatus === 'error' && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg" role="alert">
                      <p className="text-red-800 font-body font-semibold text-sm">
                        Registration failed
                      </p>
                      <p className="text-red-700 font-body text-xs mt-1">{errorMessage}</p>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                    <Input
                      id="reg_name"
                      label="Your Name"
                      type="text"
                      required
                      placeholder="e.g. Jane Smith"
                      value={formData.name}
                      error={formErrors.name}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, name: e.target.value }))
                      }
                    />

                    <Input
                      id="reg_email"
                      label="Email Address"
                      type="email"
                      required
                      placeholder="e.g. jane@example.com"
                      value={formData.email}
                      error={formErrors.email}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, email: e.target.value }))
                      }
                    />
                    <Input
                      id="reg_phone"
                      label="Phone Number"
                      type="tel"
                      required
                      placeholder="e.g. 0412 345 678"
                      value={formData.phone}
                      error={formErrors.phone}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, phone: e.target.value }))
                      }
                    />

                    <div className="w-full">
                      <label htmlFor="reg_quantity" className="form-label">
                        Quantity
                      </label>
                      <input
                        id="reg_quantity"
                        type="number"
                        min={1}
                        max={20}
                        required
                        className="form-input"
                        value={formData.quantity}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            quantity: Math.max(1, parseInt(e.target.value) || 1),
                          }))
                        }
                      />
                      {formErrors.quantity && (
                        <p className="mt-1 text-sm text-red-600">{formErrors.quantity}</p>
                      )}
                    </div>

                    <Button
                      type="submit"
                      isLoading={isSubmitting}
                      className="w-full"
                    >
                      {isSubmitting ? 'Registering...' : 'Register Now'}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

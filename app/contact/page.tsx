'use client';

import { useState, useEffect, FormEvent } from 'react';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input, { Textarea, Select } from '@/components/ui/Input';
import {
  CLUB_ADDRESS,
  CLUB_GROUND,
  CLUB_EMAIL_USER,
  CLUB_EMAIL_DOMAIN,
  COMMITTEE,
  ENQUIRY_TYPES,
  GOOGLE_MAPS_EMBED_URL,
} from '@/lib/constants';
import { assembleEmail } from '@/lib/utils';

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    enquiry_type: '',
    message: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    document.title = 'Contact Us | NDCC Dinos';
  }, []);

  const clubEmail = assembleEmail(CLUB_EMAIL_USER, CLUB_EMAIL_DOMAIN);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus('idle');
    setErrorMessage('');

    try {
      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Something went wrong. Please try again.');
      }

      setSubmitStatus('success');
      setFormData({ name: '', email: '', enquiry_type: '', message: '' });
    } catch (err) {
      setSubmitStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {/* Hero */}
      <section className="page-hero">
        <div className="container-width">
          <h1 className="page-hero-title">Contact Us</h1>
          <p className="page-hero-subtitle">
            Have a question, want to join, or looking to get involved? We&apos;d love to hear from you.
          </p>
        </div>
      </section>

      {/* Contact Form + Details */}
      <section className="section-padding">
        <div className="container-width">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Form Column */}
            <div>
              <h2 className="section-title">Send Us a Message</h2>
              <p className="text-gray-600 font-body mb-8">
                Fill out the form below and we&apos;ll get back to you as soon as possible.
              </p>

              {submitStatus === 'success' && (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg" role="alert">
                  <p className="text-green-800 font-body font-semibold">Message sent successfully!</p>
                  <p className="text-green-700 font-body text-sm mt-1">
                    Thank you for your enquiry. A committee member will be in touch shortly.
                  </p>
                </div>
              )}

              {submitStatus === 'error' && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg" role="alert">
                  <p className="text-red-800 font-body font-semibold">Failed to send message</p>
                  <p className="text-red-700 font-body text-sm mt-1">{errorMessage}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <Input
                  id="name"
                  label="Your Name"
                  type="text"
                  required
                  placeholder="e.g. Jane Smith"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                />

                <Input
                  id="email"
                  label="Email Address"
                  type="email"
                  required
                  placeholder="e.g. jane@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                />

                <Select
                  id="enquiry_type"
                  label="Enquiry Type"
                  required
                  options={[...ENQUIRY_TYPES]}
                  value={formData.enquiry_type}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, enquiry_type: e.target.value }))
                  }
                />

                <Textarea
                  id="message"
                  label="Message"
                  required
                  placeholder="Tell us how we can help..."
                  rows={5}
                  value={formData.message}
                  onChange={(e) => setFormData((prev) => ({ ...prev, message: e.target.value }))}
                />

                <Button type="submit" isLoading={isSubmitting} size="lg" className="w-full sm:w-auto">
                  {isSubmitting ? 'Sending...' : 'Send Message'}
                </Button>
              </form>
            </div>

            {/* Details Column */}
            <div className="space-y-8">
              {/* Address */}
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-xl font-display font-bold text-gray-900 mb-4">Club Details</h3>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-maroon-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                      </svg>
                      <div>
                        <p className="font-body font-semibold text-gray-900">{CLUB_GROUND}</p>
                        <p className="font-body text-gray-600 text-sm">{CLUB_ADDRESS}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-maroon-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                      </svg>
                      <div>
                        <p className="font-body font-semibold text-gray-900">Email</p>
                        <a
                          href={`mailto:${clubEmail}`}
                          className="font-body text-maroon-700 hover:text-maroon-500 text-sm transition-colors"
                        >
                          {clubEmail}
                        </a>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Committee */}
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-xl font-display font-bold text-gray-900 mb-4">Committee</h3>
                  <ul className="space-y-3">
                    {COMMITTEE.map((member) => (
                      <li key={member.name} className="flex items-center justify-between">
                        <span className="font-body text-gray-900">{member.name}</span>
                        <span className="font-body text-sm text-maroon-600 font-semibold">
                          {member.role}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* Google Maps */}
              <Card>
                <div className="overflow-hidden rounded-xl">
                  <iframe
                    src={GOOGLE_MAPS_EMBED_URL}
                    width="100%"
                    height="300"
                    style={{ border: 0 }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title={`Map showing ${CLUB_GROUND}, ${CLUB_ADDRESS}`}
                  />
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

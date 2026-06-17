'use client';

import { useState, useEffect, FormEvent } from 'react';
import Card, { CardContent } from '@/components/ui/Card';
import ScrollReveal from '@/components/common/ScrollReveal';
import Button from '@/components/ui/Button';
import Input, { Textarea, Select } from '@/components/ui/Input';
import {
  COMMITTEE,
  ENQUIRY_TYPES,
} from '@/lib/constants';
import { fallbackClubSettings, type ClubSettings } from '@/lib/club-settings-types';

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    enquiry_type: '',
    message: '',
    hp_field: '',
    submitted_at: Date.now(),
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'warning' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [heroTitle, setHeroTitle] = useState('Contact Us');
  const [heroBody, setHeroBody] = useState('Have a question, want to join, or looking to get involved? We’d love to hear from you.');
  const [formIntro, setFormIntro] = useState('Fill out the form below and we’ll get back to you as soon as possible.');
  const [detailsTitle, setDetailsTitle] = useState('Club Details');
  const [settings, setSettings] = useState<ClubSettings>(fallbackClubSettings);

  useEffect(() => {
    document.title = 'Contact Us | NDCC Dinos';

    async function fetchContentBlocks() {
      try {
        const res = await fetch('/api/content-blocks?keys=contact.hero,contact.form_intro,contact.details', { cache: 'no-store' });
        const data = await res.json();
        const blocks = (data.data || []) as Array<{ block_key: string; title?: string; body?: string }>;
        const hero = blocks.find((b) => b.block_key === 'contact.hero');
        const form = blocks.find((b) => b.block_key === 'contact.form_intro');
        const details = blocks.find((b) => b.block_key === 'contact.details');
        if (hero?.title) setHeroTitle(hero.title);
        if (hero?.body) setHeroBody(hero.body);
        if (form?.body) setFormIntro(form.body);
        if (details?.title) setDetailsTitle(details.title);
      } catch {
        // fallback copy
      }
    }

    fetchContentBlocks();

    async function fetchClubSettings() {
      try {
        const res = await fetch('/api/club-settings', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.data) setSettings(data.data);
      } catch {
        // Safe fallback constants are already loaded.
      }
    }

    fetchClubSettings();
  }, []);

  const clubPhoneHref = settings.phone ? `tel:${settings.phone.replace(/\s+/g, '')}` : undefined;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus('idle');
    setErrorMessage('');

    try {
      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, submitted_at: formData.submitted_at }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || 'Something went wrong. Please try again.');
      }

      setErrorMessage(data?.message || 'Message sent successfully!');
      setSubmitStatus(data?.emailStatus === 'sent' ? 'success' : 'warning');
      setFormData({ name: '', email: '', enquiry_type: '', message: '', hp_field: '', submitted_at: Date.now() });
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
          <ScrollReveal onMount delay={0}><h1 className="page-hero-title">{heroTitle}</h1></ScrollReveal>
          <ScrollReveal onMount delay={0.15}><p className="page-hero-subtitle">{heroBody}</p></ScrollReveal>
        </div>
      </section>

      {/* Contact Form + Details */}
      <section className="section-padding">
        <div className="container-width">
          <ScrollReveal>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Form Column */}
            <div>
              <h2 className="section-title">Send Us a Message</h2>
              <p className="text-gray-600 font-body mb-8">{formIntro}</p>

              {submitStatus === 'success' && (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg" role="alert">
                  <p className="text-green-800 font-body font-semibold">Message sent successfully!</p>
                  <p className="text-green-700 font-body text-sm mt-1">
                    {errorMessage || 'Thank you for your enquiry. A committee member will be in touch shortly.'}
                  </p>
                </div>
              )}

              {submitStatus === 'warning' && (
                <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg" role="alert">
                  <p className="text-yellow-900 font-body font-semibold">Enquiry received</p>
                  <p className="text-yellow-800 font-body text-sm mt-1">
                    {errorMessage || 'Your enquiry was saved, but email notification failed. Please email ndcc.secretary1@gmail.com if urgent.'}
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
                  <h3 className="text-xl font-display font-bold text-gray-900 mb-4">{detailsTitle}</h3>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-maroon-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                      </svg>
                      <div>
                        <p className="font-body font-semibold text-gray-900">{settings.ground_name}</p>
                        <p className="font-body text-gray-600 text-sm">{settings.address}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-maroon-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0-1.243 1.007-2.25 2.25-2.25h2.268c1.141 0 2.116.816 2.317 1.939l.734 4.117a2.25 2.25 0 0 1-.96 2.281l-1.53 1.02a11.042 11.042 0 0 0 5.523 5.523l1.02-1.53a2.25 2.25 0 0 1 2.281-.96l4.117.734a2.25 2.25 0 0 1 1.939 2.317V19.5a2.25 2.25 0 0 1-2.25 2.25h-.75C10.3 21.75 2.25 13.7 2.25 3.75v3Z" />
                      </svg>
                      <div>
                        <p className="font-body font-semibold text-gray-900">Contact</p>
                        <a
                          href={clubPhoneHref}
                          className="font-body text-maroon-700 hover:text-maroon-500 text-sm transition-colors"
                        >
                          {settings.phone}
                        </a>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-maroon-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                      </svg>
                      <div>
                        <p className="font-body font-semibold text-gray-900">Email</p>
                        <a
                          href={settings.email ? `mailto:${settings.email}` : undefined}
                          className="font-body text-maroon-700 hover:text-maroon-500 text-sm transition-colors"
                        >
                          {settings.email}
                        </a>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>


              {/* Social Links */}
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-xl font-display font-bold text-gray-900 mb-4">Social Links</h3>
                  <div className="space-y-2">
                    {settings.facebook_url && (
                      <a
                        href={settings.facebook_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block font-body text-maroon-700 hover:text-maroon-500 text-sm transition-colors"
                      >
                        Facebook
                      </a>
                    )}
                    {settings.instagram_url && (
                      <a
                        href={settings.instagram_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block font-body text-maroon-700 hover:text-maroon-500 text-sm transition-colors"
                      >
                        Instagram{settings.instagram_handle ? ` (${settings.instagram_handle})` : ''}
                      </a>
                    )}
                    {settings.playhq_url && (
                      <a
                        href={settings.playhq_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block font-body text-maroon-700 hover:text-maroon-500 text-sm transition-colors"
                      >
                        PlayHQ
                      </a>
                    )}
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
                    src={settings.google_maps_embed_url || fallbackClubSettings.google_maps_embed_url || undefined}
                    width="100%"
                    height="300"
                    style={{ border: 0 }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title={`Map showing ${settings.ground_name}, ${settings.address}`}
                  />
                </div>
              </Card>
            </div>
          </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}

'use client';

import { useState, useEffect, FormEvent } from 'react';
import Link from 'next/link';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input, { Textarea, Select } from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import { SPONSOR_TIERS, CLUB_NAME } from '@/lib/constants';
import { validateEmail } from '@/lib/utils';

const TIER_GRADIENTS: Record<string, string> = {
  major: 'from-maroon-700 to-maroon-900',
  gold: 'from-yellow-500 to-yellow-700',
  silver: 'from-gray-300 to-gray-500',
  standard: 'from-maroon-400 to-maroon-600',
  community: 'from-sky-300 to-sky-500',
};

const TIER_BADGE_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  major: 'danger',
  gold: 'warning',
  silver: 'default',
  standard: 'info',
  community: 'success',
};

const PLACEHOLDER_SPONSORS: Record<string, string[]> = {
  major: ['Geelong Building Co.', 'Corio Bay Finance', 'Bellarine Auto Group'],
  gold: ['Newcomb Central Pharmacy', 'Moolap Fresh Produce', 'Peninsula Plumbing'],
  silver: ['Grinter&apos;s Café', 'South Barwon Electrical', 'Dinos Sports Physio'],
  standard: ['Newcomb Fish & Chips', 'Coppards Road Meats', 'Geelong Print Works'],
  community: ['Newcomb Neighbourhood House', 'Moolap Primary School', 'Geelong Libraries'],
};

export default function SponsorsPage() {
  const [formData, setFormData] = useState({
    company_name: '',
    contact_name: '',
    email: '',
    phone: '',
    tier_interest: '',
    message: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    document.title = 'Our Sponsors | NDCC Dinos';
  }, []);

  function validateForm(): boolean {
    const errors: Record<string, string> = {};
    if (!formData.company_name.trim()) errors.company_name = 'Company name is required';
    if (!formData.contact_name.trim()) errors.contact_name = 'Contact name is required';
    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!validateEmail(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }
    if (!formData.tier_interest) errors.tier_interest = 'Please select a sponsorship tier';
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
      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${formData.company_name} — ${formData.contact_name}`,
          email: formData.email,
          enquiry_type: 'sponsorship',
          message: `Tier Interest: ${formData.tier_interest}\nPhone: ${formData.phone || 'Not provided'}\n\n${formData.message}`,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Something went wrong. Please try again.');
      }

      setSubmitStatus('success');
      setFormData({ company_name: '', contact_name: '', email: '', phone: '', tier_interest: '', message: '' });
      setFormErrors({});
    } catch (err) {
      setSubmitStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const tierOptions = SPONSOR_TIERS.map((t) => ({ value: t.value, label: t.label }));

  return (
    <>
      {/* Hero */}
      <section className="page-hero">
        <div className="container-width">
          <h1 className="page-hero-title">Our Sponsors</h1>
          <p className="page-hero-subtitle">
            The generous support of our sponsors helps keep cricket thriving in the Newcomb and
            Geelong community. We are grateful for every partnership.
          </p>
        </div>
      </section>

      {/* Intro */}
      <section className="section-padding bg-gray-50">
        <div className="container-width">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="section-title">Community Support</h2>
            <p className="text-gray-600 font-body text-lg leading-relaxed">
              {CLUB_NAME} relies on the support of local businesses and community organisations to
              provide affordable cricket for players of all ages. Our sponsors help fund equipment,
              ground maintenance, junior development programmes, and club events. Every sponsorship
              dollar goes directly back into our cricket community.
            </p>
          </div>
        </div>
      </section>

      {/* Sponsor Tiers */}
      {SPONSOR_TIERS.map((tier) => (
        <section
          key={tier.value}
          className={tier.order % 2 === 0 ? 'section-padding bg-gray-50' : 'section-padding'}
        >
          <div className="container-width">
            <div className="flex items-center gap-3 mb-8">
              <h2 className="section-title mb-0">{tier.label}s</h2>
              <Badge variant={TIER_BADGE_VARIANT[tier.value]}>{tier.label}</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {(PLACEHOLDER_SPONSORS[tier.value] || []).map((name, idx) => (
                <Card key={idx} hover>
                  <div
                    className={`h-40 bg-gradient-to-br ${TIER_GRADIENTS[tier.value]} flex items-center justify-center`}
                    aria-hidden="true"
                  >
                    <span className="text-white font-display font-bold text-xl opacity-80">
                      {name}
                    </span>
                  </div>
                  <CardContent>
                    <h3 className="font-display font-bold text-gray-900 text-lg">{name}</h3>
                    <p className="text-sm text-gray-500 font-body mt-1">
                      Proud {tier.label.toLowerCase()} of {CLUB_NAME}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      ))}

      {/* Become a Sponsor */}
      <section className="section-padding bg-maroon-800 text-white">
        <div className="container-width text-center">
          <h2 className="text-3xl sm:text-4xl font-display font-bold mb-4">Become a Sponsor</h2>
          <p className="text-maroon-100 font-body text-lg max-w-2xl mx-auto mb-6">
            Interested in partnering with the Dinos? We offer flexible sponsorship packages for
            businesses of all sizes. Get your brand in front of our members, families, and the wider
            Geelong cricket community.
          </p>
          <Link href="#enquiry-form" className="btn-accent">
            Enquire Below
          </Link>
        </div>
      </section>

      {/* Sponsorship Enquiry Form */}
      <section id="enquiry-form" className="section-padding" aria-label="Sponsorship enquiry form">
        <div className="container-width max-w-2xl mx-auto">
          <h2 className="section-title text-center">Sponsorship Enquiry</h2>
          <p className="section-subtitle text-center mx-auto mb-8">
            Fill out the form below and our sponsorship coordinator will be in touch.
          </p>

          {submitStatus === 'success' && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg" role="alert">
              <p className="text-green-800 font-body font-semibold">Enquiry sent successfully!</p>
              <p className="text-green-700 font-body text-sm mt-1">
                Thank you for your interest in sponsoring {CLUB_NAME}. A committee member will be in
                touch shortly to discuss partnership opportunities.
              </p>
            </div>
          )}

          {submitStatus === 'error' && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg" role="alert">
              <p className="text-red-800 font-body font-semibold">Failed to send enquiry</p>
              <p className="text-red-700 font-body text-sm mt-1">{errorMessage}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            <Input
              id="company_name"
              label="Company Name"
              type="text"
              required
              placeholder="e.g. Geelong Building Co."
              value={formData.company_name}
              error={formErrors.company_name}
              onChange={(e) => setFormData((prev) => ({ ...prev, company_name: e.target.value }))}
            />

            <Input
              id="contact_name"
              label="Contact Name"
              type="text"
              required
              placeholder="e.g. Jane Smith"
              value={formData.contact_name}
              error={formErrors.contact_name}
              onChange={(e) => setFormData((prev) => ({ ...prev, contact_name: e.target.value }))}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <Input
                id="sponsor_email"
                label="Email Address"
                type="email"
                required
                placeholder="e.g. jane@company.com.au"
                value={formData.email}
                error={formErrors.email}
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
              />

              <Input
                id="sponsor_phone"
                label="Phone (optional)"
                type="tel"
                placeholder="e.g. 0412 345 678"
                value={formData.phone}
                onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
              />
            </div>

            <Select
              id="tier_interest"
              label="Sponsorship Tier Interest"
              required
              options={[...tierOptions]}
              value={formData.tier_interest}
              error={formErrors.tier_interest}
              onChange={(e) => setFormData((prev) => ({ ...prev, tier_interest: e.target.value }))}
            />

            <Textarea
              id="sponsor_message"
              label="Message (optional)"
              placeholder="Tell us about your business and what you're looking for in a sponsorship..."
              rows={4}
              value={formData.message}
              onChange={(e) => setFormData((prev) => ({ ...prev, message: e.target.value }))}
            />

            <Button type="submit" isLoading={isSubmitting} size="lg" className="w-full sm:w-auto">
              {isSubmitting ? 'Sending...' : 'Submit Enquiry'}
            </Button>
          </form>
        </div>
      </section>
    </>
  );
}

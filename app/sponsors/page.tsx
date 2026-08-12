'use client';

import { useState, useEffect, FormEvent } from 'react';
import Link from 'next/link';
import { CheckCircle2, XCircle } from 'lucide-react';
import LogoChip from '@/components/common/LogoChip';
import Card, { CardContent } from '@/components/ui/Card';
import ScrollReveal, { ScrollRevealItem } from '@/components/common/ScrollReveal';
import Button from '@/components/ui/Button';
import Input, { Textarea, Select } from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import {
  SPONSOR_TIERS,
  CLUB_NAME,
  CLUB_EMAIL_USER,
  CLUB_EMAIL_DOMAIN,
  CLUB_PHONE,
  SEED_SPONSOR_DESCRIPTIONS,
} from '@/lib/constants';
import { sponsorshipDownloads2026_27 } from '@/lib/assets';
import { getInitials, validateEmail } from '@/lib/utils';
import type { Sponsor } from '@/lib/types';
import { mergeSponsorsWithFallback } from '@/lib/fallback-content';


const SPONSOR_DESCRIPTIONS_BY_NAME: Record<string, string> = {
  'APCO': 'Australian-owned service station and convenience retailer with Geelong-region locations, including Newcomb and North Geelong.',
  'Bennett': 'Proud local supporter of Newcomb and District Cricket Club.',
  "Blackman's Brewery": SEED_SPONSOR_DESCRIPTIONS['seed-blackmans'],
  'Champion Trophies': SEED_SPONSOR_DESCRIPTIONS['seed-champion'],
  'GP': 'Proud local supporter of Newcomb and District Cricket Club.',
  'Leopold Sportsmans Club': SEED_SPONSOR_DESCRIPTIONS['seed-leopold'],
  'Mahoney': 'Geelong and Bellarine Peninsula real estate services.',
  'MBR Cricket': SEED_SPONSOR_DESCRIPTIONS['seed-mbr'],
  'Phoenix Truck Bodies': SEED_SPONSOR_DESCRIPTIONS['seed-phoenix'],
};

function getSponsorDescription(sponsor: Sponsor) {
  return SEED_SPONSOR_DESCRIPTIONS[sponsor.id] || SPONSOR_DESCRIPTIONS_BY_NAME[sponsor.name] || '';
}

const TIER_BADGE_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  major: 'danger',
  gold: 'warning',
  silver: 'default',
  standard: 'info',
  community: 'success',
};

export default function SponsorsPage() {
  const clubEmail = `${CLUB_EMAIL_USER}@${CLUB_EMAIL_DOMAIN}`;
  const clubPhoneHref = `tel:${CLUB_PHONE.replace(/\s+/g, '')}`;
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    company_name: '',
    contact_name: '',
    email: '',
    phone: '',
    tier_interest: '',
    message: '',
    hp_field: '',
    submitted_at: Date.now(),
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [heroTitle, setHeroTitle] = useState('Our Sponsors');
  const [heroBody, setHeroBody] = useState('The generous support of our sponsors helps keep cricket thriving in the Newcomb and Geelong community. We are grateful for every partnership.');
  const [introTitle, setIntroTitle] = useState('Community Support');
  const [introBody, setIntroBody] = useState(
    `${CLUB_NAME} relies on the support of local businesses and community organisations to provide affordable cricket for players of all ages. Our sponsors help fund equipment, ground maintenance, junior development programmes, and club events. Every sponsorship dollar goes directly back into our cricket community.`
  );

  useEffect(() => {
    document.title = 'Our Sponsors | NDCC Dinos';

    async function fetchSponsors() {
      try {
        const res = await fetch('/api/public/sponsors', { cache: 'no-store' });
        const json = await res.json();

        if (!res.ok || json.success === false) throw new Error(json.error || 'Failed to load sponsors');
        // A successful response is live truth, including an empty list — never
        // substitute the static seed sponsors for real CMS data. The merge only
        // backfills missing logo/website fields on live rows.
        const rows = Array.isArray(json.data) ? (json.data as Sponsor[]) : [];
        setSponsors(rows.length > 0 ? mergeSponsorsWithFallback(rows) : []);
      } catch {
        // On a Supabase cold start the API aborts; show the static fallback (real sponsors)
        // instead of a diagnostic so the grid is never empty or broken.
        setSponsors(mergeSponsorsWithFallback([]));
      } finally {
        setLoading(false);
      }
    }

    async function fetchContentBlock() {
      try {
        const res = await fetch('/api/content-blocks?keys=sponsors.hero,sponsors.intro', { cache: 'no-store' });
        const data = await res.json();
        const blocks = (data.data || []) as Array<{ block_key: string; title?: string; body?: string }>;
        const hero = blocks.find((b) => b.block_key === 'sponsors.hero');
        const intro = blocks.find((b) => b.block_key === 'sponsors.intro');
        if (hero?.title) setHeroTitle(hero.title);
        if (hero?.body) setHeroBody(hero.body);
        if (intro?.title) setIntroTitle(intro.title);
        if (intro?.body) setIntroBody(intro.body);
      } catch {
        // fallback copy
      }
    }

    fetchSponsors();
    fetchContentBlock();
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
          name: `${formData.company_name} - ${formData.contact_name}`,
          email: formData.email,
          enquiry_type: 'sponsorship',
          message: `Tier Interest: ${formData.tier_interest}\nPhone: ${formData.phone || 'Not provided'}\n\n${formData.message}`,
          hp_field: formData.hp_field,
          submitted_at: formData.submitted_at,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Something went wrong. Please try again.');
      }

      setSubmitStatus('success');
      setFormData({ company_name: '', contact_name: '', email: '', phone: '', tier_interest: '', message: '', hp_field: '', submitted_at: Date.now() });
      setFormErrors({});
    } catch (err) {
      setSubmitStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const tierOptions = SPONSOR_TIERS.map((t) => ({ value: t.value, label: t.label }));

  // Group sponsors by tier
  const sponsorsByTier = SPONSOR_TIERS.reduce<Record<string, Sponsor[]>>((acc, tier) => {
    acc[tier.value] = sponsors.filter((s) => s.tier === tier.value);
    return acc;
  }, {});

  const tiersWithSponsors = SPONSOR_TIERS.filter((tier) => sponsorsByTier[tier.value].length > 0);

  return (
    <>
      {/* Hero */}
      <section className="page-hero">
        <div className="container-width">
          <ScrollReveal onMount delay={0}><h1 className="page-hero-title">{heroTitle}</h1></ScrollReveal>
          <ScrollReveal onMount delay={0.15}><p className="page-hero-subtitle">{heroBody}</p></ScrollReveal>
        </div>
      </section>

      <nav className="border-b border-edge-subtle bg-surface-card px-4 py-3 sm:px-6 lg:px-8" aria-label="On this page">
        <div className="container-width flex flex-wrap items-center gap-x-5 gap-y-2 font-body text-sm font-semibold">
          <span className="text-content-muted">On this page</span>
          <a href="#current-sponsors" className="text-maroon-700 hover:underline dark:text-maroon-200">Current sponsors</a>
          <a href="#sponsorship-packages" className="text-maroon-700 hover:underline dark:text-maroon-200">Packages</a>
          <a href="#enquiry-form" className="text-maroon-700 hover:underline dark:text-maroon-200">Enquire</a>
        </div>
      </nav>

      {/* Intro and sponsor tiers share one section so every current partner stays
          visible without repeating full-page vertical padding for each tier. */}
      <section
        id="current-sponsors"
        className="section-padding bg-surface-page scroll-mt-28"
        aria-label="Current sponsors by tier"
      >
        <div className="container-width">
          <ScrollReveal className="mx-auto mb-8 max-w-3xl text-center">
            <h2 className="section-title">{introTitle}</h2>
            <p className="text-content-muted font-body text-lg leading-relaxed">
              {introBody}
            </p>
          </ScrollReveal>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-surface-card rounded-xl border border-edge-subtle p-6 animate-pulse">
                  <div className="h-20 bg-gray-200 rounded mb-4" />
                  <div className="h-4 bg-gray-200 rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : tiersWithSponsors.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <h2 className="text-2xl font-display font-bold text-maroon-800 dark:text-maroon-200 mb-2">No active sponsors published</h2>
                <p className="text-content-muted font-body">Active sponsor records will appear here after they are published in the CMS.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-7">
              {tiersWithSponsors.map((tier, idx) => (
                <div
                  key={tier.value}
                  data-sponsor-tier={tier.value}
                  className={idx === 0 ? undefined : 'border-t border-edge-subtle pt-7'}
                >
                  {/* Honour-board tier divider: short maroon rule + gold-tinted tier badge. */}
                  <div className="mb-4 flex items-center gap-4">
                    <span className="h-1 w-10 rounded-full bg-maroon-700" aria-hidden="true" />
                    <h2 className="section-title mb-0">{tier.label}s</h2>
                    <Badge variant={TIER_BADGE_VARIANT[tier.value]}>{tier.label}</Badge>
                  </div>
                  <ScrollReveal
                    stagger
                    className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${tier.value === 'standard' ? 'lg:grid-cols-3 xl:grid-cols-5' : 'lg:grid-cols-3'}`}
                  >
                    {sponsorsByTier[tier.value].map((sponsor) => {
                      const description = getSponsorDescription(sponsor);
                      const logoFallback = (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-lg bg-maroon-800 px-4 text-center">
                          <span className="font-display text-2xl font-bold leading-none text-gold-200">{getInitials(sponsor.name)}</span>
                          <span className="font-display text-xs font-semibold uppercase tracking-wide text-gold-100">{sponsor.name}</span>
                        </div>
                      );
                      return (
                        <ScrollRevealItem key={sponsor.id}>
                          <a
                            href={sponsor.website || undefined}
                            target={sponsor.website ? '_blank' : undefined}
                            rel={sponsor.website ? 'noopener noreferrer' : undefined}
                            className="block group"
                          >
                            <div className="card-hover-sponsor h-full">
                              <CardContent className="p-5">
                                <LogoChip
                                  name={sponsor.name}
                                  src={sponsor.logo_url}
                                  surfaceMode={sponsor.logo_surface_mode}
                                  paddingClassName={sponsor.logo_padding}
                                  objectPosition={sponsor.logo_object_position}
                                  width={220}
                                  height={96}
                                  sizes="220px"
                                  className="mb-3 h-24 rounded-xl ring-1 ring-maroon-100"
                                  imageClassName="max-h-16 max-w-[85%] w-auto drop-shadow-sm"
                                  fallback={logoFallback}
                                />
                                {/* Name caption beneath the logo so a low-contrast or missing logo still
                                    shows an identifiable, non-empty card. */}
                                <h3 className="font-display font-bold text-content-primary text-lg group-hover:text-maroon-700 transition-colors mb-2">
                                  {sponsor.name}
                                </h3>
                                {description && (
                                  <p className="text-content-muted font-body text-sm mb-3">{description}</p>
                                )}
                                {sponsor.website && (
                                  <p className="text-maroon-600 dark:text-maroon-300 font-body text-sm font-semibold group-hover:underline inline-flex items-center">
                                    Visit website
                                    <svg className="ml-1 w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                    </svg>
                                  </p>
                                )}
                              </CardContent>
                            </div>
                          </a>
                        </ScrollRevealItem>
                      );
                    })}
                    {idx === tiersWithSponsors.length - 1 && (
                      <ScrollRevealItem key="become-a-sponsor-cta">
                        <Link href="#enquiry-form" className="group block h-full">
                          <Card hover className="h-full border-2 border-dashed border-maroon-200">
                            <CardContent className="flex h-full flex-col items-center justify-center p-6 text-center">
                              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-maroon-50 dark:bg-maroon-950 text-2xl font-bold text-maroon-700 dark:text-maroon-200 transition-colors group-hover:bg-maroon-100" aria-hidden="true">+</span>
                              <h3 className="font-display text-lg font-bold text-maroon-800 dark:text-maroon-200">Become a Sponsor</h3>
                              <p className="mt-1 font-body text-sm text-content-muted">Partner with the Dinos — enquire below.</p>
                            </CardContent>
                          </Card>
                        </Link>
                      </ScrollRevealItem>
                    )}
                  </ScrollReveal>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section id="sponsorship-packages" className="section-padding bg-surface-page scroll-mt-28">
        <div className="container-width mx-auto grid max-w-5xl grid-cols-1 items-start gap-4 lg:grid-cols-[1.25fr_1fr]">
          <Card>
            <CardContent className="p-5">
              <h2 className="text-2xl font-display font-bold text-content-primary mb-3">2026/27 Sponsorship Packages</h2>
              {/* Same 8 real packages/prices, presented as a scannable ledger table. */}
              <div className="mb-4" aria-label="Sponsorship package summary">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeader className="py-2">Package</TableHeader>
                      <TableHeader className="py-2 text-right">Price</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {[
                      ['Social Membership', 'AUD 75'],
                      ['Match Day Ball Sponsor', 'AUD 150'],
                      ['Player Sponsorship', 'AUD 350'],
                      ['Bronze Sponsorship', 'AUD 450'],
                      ['Silver Sponsorship', 'AUD 850'],
                      ['Gold Sponsorship', 'AUD 1,150'],
                      ['Diamond Sponsorship', 'AUD 1,550'],
                      ['Platinum Sponsorship', 'AUD 2,100'],
                    ].map(([tier, price]) => (
                      <TableRow key={tier}>
                        <TableCell className="py-2 font-semibold text-content-primary">{tier}</TableCell>
                        <TableCell className="py-2 text-right font-display font-bold text-maroon-700 dark:text-maroon-200">{price}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-2">
                {sponsorshipDownloads2026_27.map((download) => (
                  <a key={download.href} href={download.href} target="_blank" rel="noopener noreferrer" className="block text-maroon-700 dark:text-maroon-200 hover:text-maroon-500 hover:underline font-body">
                    {download.title}
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h2 className="text-2xl font-display font-bold text-content-primary mb-3">Apparel Sponsorship</h2>
              <p className="text-content-secondary font-body mb-4">
                Put your brand on Newcomb and District apparel and support community cricket in the 2026/27 season.
              </p>
              <p className="text-content-secondary font-body">
                This opportunity is separate from the standard sponsorship packages. Contact John Elliott, President, on <a href={clubPhoneHref} className="text-maroon-700 dark:text-maroon-200 hover:text-maroon-500 transition-colors">{CLUB_PHONE}</a> or via email at <a href={`mailto:${clubEmail}`} className="text-maroon-700 dark:text-maroon-200 hover:text-maroon-500 transition-colors">{clubEmail}</a>.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Sponsorship Enquiry Form */}
      <section id="enquiry-form" className="section-padding py-8 scroll-mt-28" aria-label="Sponsorship enquiry form">
        <div className="container-width max-w-2xl mx-auto">
          <h2 className="section-title text-center">Sponsorship Enquiry</h2>
          <p className="section-subtitle mx-auto mb-6 text-center">
            Fill out the form below and our sponsorship coordinator will be in touch.
          </p>

          {submitStatus === 'success' && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3" role="alert">
              <CheckCircle2 className="h-5 w-5 text-green-700 mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-green-800 font-body font-semibold">Enquiry sent successfully!</p>
                <p className="text-green-700 font-body text-sm mt-1">
                  Thank you for your interest in sponsoring {CLUB_NAME}. A committee member will be in
                  touch shortly to discuss partnership opportunities.
                </p>
              </div>
            </div>
          )}

          {submitStatus === 'error' && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3" role="alert">
              <XCircle className="h-5 w-5 text-red-700 mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-red-800 font-body font-semibold">Failed to send enquiry</p>
                <p className="text-red-700 font-body text-sm mt-1">{errorMessage}</p>
              </div>
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
              id="company_name"
              label="Company Name"
              type="text"
              required
              value={formData.company_name}
              error={formErrors.company_name}
              onChange={(e) => setFormData((prev) => ({ ...prev, company_name: e.target.value }))}
            />

            <Input
              id="contact_name"
              label="Contact Name"
              type="text"
              required
              value={formData.contact_name}
              error={formErrors.contact_name}
              onChange={(e) => setFormData((prev) => ({ ...prev, contact_name: e.target.value }))}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                id="sponsor_email"
                label="Email Address"
                type="email"
                required
                value={formData.email}
                error={formErrors.email}
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
              />

              <Input
                id="sponsor_phone"
                label="Phone (optional)"
                type="tel"
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
              placeholder="Tell us about your business and what you are looking for in a sponsorship..."
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

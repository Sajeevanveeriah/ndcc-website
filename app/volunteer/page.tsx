'use client';

import { useState, useEffect, FormEvent } from 'react';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input, { Textarea, Select } from '@/components/ui/Input';
import { validateEmail } from '@/lib/utils';

const ROLE_DETAILS = [
  {
    title: 'Canteen',
    description:
      'Help run our match-day canteen, serving food and drinks to players, families, and supporters. A great way to meet people and be part of the action.',
    icon: (
      <svg className="w-8 h-8 text-maroon-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5m-6 1.5v-1.5m12 9.75-1.5.75a3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0L3 16.5m18-12.75H3" />
      </svg>
    ),
  },
  {
    title: 'Scorer',
    description:
      'Keep the scorebook during matches for our senior or junior teams. Training provided for newcomers — no prior experience necessary, just a keen eye.',
    icon: (
      <svg className="w-8 h-8 text-maroon-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
      </svg>
    ),
  },
  {
    title: 'Ground Setup',
    description:
      'Assist with setting up and packing down on match days — laying out the pitch, moving furniture, and ensuring our ground is looking its best for players and visitors.',
    icon: (
      <svg className="w-8 h-8 text-maroon-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" />
      </svg>
    ),
  },
  {
    title: 'General Help',
    description:
      'Pitch in wherever needed — from helping at events and fundraisers to welcoming new members. Every contribution makes a difference to our club.',
    icon: (
      <svg className="w-8 h-8 text-maroon-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>
    ),
  },
];

export default function VolunteerPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: '',
    availability: '',
    hp_field: '',
    submitted_at: Date.now(),
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [dynamicRoleOptions, setDynamicRoleOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [heroTitle, setHeroTitle] = useState('Volunteer with Us');
  const [heroBody, setHeroBody] = useState(
    'Our club runs on the dedication of volunteers. Whether you can spare an hour or a whole day, your help makes a real difference to cricket in our community.'
  );

  useEffect(() => {
    document.title = 'Volunteer | NDCC Dinos';

    const loadPositions = async () => {
      try {
        const [positionsRes, contentRes] = await Promise.all([
          fetch('/api/volunteer-positions', { cache: 'no-store' }),
          fetch('/api/content-blocks?keys=volunteer.hero', { cache: 'no-store' }),
        ]);
        const data = await positionsRes.json();
        if (positionsRes.ok) {
          setDynamicRoleOptions((data.positions || []).map((p: { title: string }) => ({ value: p.title, label: p.title })));
        }
        const contentData = await contentRes.json();
        const block = (contentData.data || []).find((b: { block_key: string }) => b.block_key === 'volunteer.hero');
        if (block?.title) setHeroTitle(block.title);
        if (block?.body) setHeroBody(block.body);
      } catch {
        setDynamicRoleOptions([]);
      }
    };

    loadPositions();
  }, []);

  const roleOptions = dynamicRoleOptions;

  function validateForm(): boolean {
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) errors.name = 'Name is required';
    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!validateEmail(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }
    if (!formData.phone.trim()) errors.phone = 'Phone number is required';
    if (!formData.role) errors.role = 'Please select a volunteer role';
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
      const response = await fetch('/api/volunteers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, submitted_at: formData.submitted_at }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Something went wrong. Please try again.');
      }

      setSubmitStatus('success');
      setFormData({ name: '', email: '', phone: '', role: '', availability: '', hp_field: '', submitted_at: Date.now() });
      setFormErrors({});
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
          <h1 className="page-hero-title">{heroTitle}</h1>
          <p className="page-hero-subtitle">{heroBody}</p>
        </div>
      </section>

      {/* Intro */}
      <section className="section-padding bg-gray-50">
        <div className="container-width max-w-3xl mx-auto text-center">
          <h2 className="section-title">Why Volunteer?</h2>
          <p className="text-gray-600 font-body text-lg leading-relaxed">
            The club is community-run, and every match day, training session, and event
            relies on people like you stepping up. Volunteering is a brilliant way to connect with
            fellow members, contribute to junior development, and keep the Dinos thriving for
            generations to come. No experience necessary — just enthusiasm and a willingness to lend
            a hand.
          </p>
        </div>
      </section>

      {/* Volunteer Roles */}
      <section className="section-padding" aria-label="Volunteer roles">
        <div className="container-width">
          <h2 className="section-title text-center mb-10">Volunteer Roles</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {ROLE_DETAILS.map((role) => (
              <Card key={role.title} hover>
                <CardContent className="text-center py-8">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-maroon-50 mb-4">
                    {role.icon}
                  </div>
                  <h3 className="font-display font-bold text-gray-900 text-lg mb-2">{role.title}</h3>
                  <p className="font-body text-gray-600 text-sm leading-relaxed">
                    {role.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Registration Form */}
      <section className="section-padding bg-gray-50" aria-label="Volunteer registration form">
        <div className="container-width max-w-2xl mx-auto">
          <h2 className="section-title text-center">Register to Volunteer</h2>
          <p className="section-subtitle text-center mx-auto mb-8">
            Keen to get involved? Fill out the form and we&apos;ll match you with a role that suits your
            availability.
          </p>

          {submitStatus === 'success' && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg" role="alert">
              <p className="text-green-800 font-body font-semibold">Registration received!</p>
              <p className="text-green-700 font-body text-sm mt-1">
                Thank you for volunteering with the Dinos! A club coordinator will be in touch to
                discuss next steps.
              </p>
            </div>
          )}

          {submitStatus === 'error' && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg" role="alert">
              <p className="text-red-800 font-body font-semibold">Something went wrong</p>
              <p className="text-red-700 font-body text-sm mt-1">{errorMessage}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
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
              id="vol_name"
              label="Your Name"
              type="text"
              required
              placeholder="e.g. Jane Smith"
              value={formData.name}
              error={formErrors.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <Input
                id="vol_email"
                label="Email Address"
                type="email"
                required
                placeholder="e.g. jane@example.com"
                value={formData.email}
                error={formErrors.email}
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
              />

              <Input
                id="vol_phone"
                label="Phone Number"
                type="tel"
                required
                placeholder="e.g. 0412 345 678"
                value={formData.phone}
                error={formErrors.phone}
                onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
              />
            </div>

            <Select
              id="vol_role"
              label="Preferred Role"
              required
              options={[...roleOptions]}
              value={formData.role}
              error={formErrors.role}
              onChange={(e) => setFormData((prev) => ({ ...prev, role: e.target.value }))}
            />

            <Textarea
              id="vol_availability"
              label="Availability"
              placeholder="Let us know when you're available — e.g. Saturday mornings, weekday evenings, specific dates..."
              rows={4}
              value={formData.availability}
              onChange={(e) => setFormData((prev) => ({ ...prev, availability: e.target.value }))}
            />

            <Button type="submit" isLoading={isSubmitting} size="lg" className="w-full sm:w-auto">
              {isSubmitting ? 'Submitting...' : 'Register as Volunteer'}
            </Button>
          </form>
        </div>
      </section>
    </>
  );
}

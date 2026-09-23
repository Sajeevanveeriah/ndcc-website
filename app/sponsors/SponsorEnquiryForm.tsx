'use client';

import { useState, FormEvent } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input, { Textarea, Select } from '@/components/ui/Input';
import { CLUB_NAME } from '@/lib/constants';
import { validateEmail } from '@/lib/utils';

// Client island for the sponsorship enquiry form: state, honeypot,
// validation, submission and status messages. The rest of /sponsors is
// server-rendered.
export default function SponsorEnquiryForm({ tierOptions }: { tierOptions: Array<{ value: string; label: string }> }) {
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

  function validateForm(): boolean {
    const errors: Record<string, string> = {};
    if (!formData.company_name.trim()) errors.company_name = 'Company name is required';
    if (!formData.contact_name.trim()) errors.contact_name = 'Contact name is required';
    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!validateEmail(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }
    if (!formData.tier_interest) errors.tier_interest = 'Please select a sponsorship package';
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
          message: `Package Interest: ${formData.tier_interest}\nPhone: ${formData.phone || 'Not provided'}\n\n${formData.message}`,
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

  return (
    <>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
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
          label="Sponsorship Package Interest"
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
    </>
  );
}

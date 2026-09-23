'use client';

import { useState, FormEvent } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input, { Textarea, Select } from '@/components/ui/Input';
import { validateEmail } from '@/lib/utils';

// Client island for the volunteer registration form: state, honeypot,
// validation, submission and status messages. Role options are resolved
// server-side by the page (CMS positions, else the static VOLUNTEER_ROLES).
export default function VolunteerForm({ roleOptions }: { roleOptions: Array<{ value: string; label: string }> }) {
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
      {submitStatus === 'success' && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3" role="alert">
          <CheckCircle2 className="h-5 w-5 text-green-700 mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-green-800 font-body font-semibold">Registration received!</p>
            <p className="text-green-700 font-body text-sm mt-1">
              Thank you for volunteering with the Dinos! A club coordinator will be in touch to
              discuss next steps.
            </p>
          </div>
        </div>
      )}

      {submitStatus === 'error' && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3" role="alert">
          <XCircle className="h-5 w-5 text-red-700 mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-red-800 font-body font-semibold">Something went wrong</p>
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
    </>
  );
}

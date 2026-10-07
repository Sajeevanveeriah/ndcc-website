'use client';

import { useState, FormEvent } from 'react';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input, { Textarea, Select } from '@/components/ui/Input';
import { ENQUIRY_TYPES } from '@/lib/constants';
import TurnstileWidget, { useTurnstile } from '@/components/common/TurnstileWidget';

// Client island for the contact page: form state, honeypot, submission and
// status messages. Everything else on the page is server-rendered.
export default function ContactForm({ urgentEmail }: { urgentEmail: string }) {
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
  const turnstile = useTurnstile();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!turnstile.check()) return;
    setIsSubmitting(true);
    setSubmitStatus('idle');
    setErrorMessage('');

    try {
      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, submitted_at: formData.submitted_at, turnstileToken: turnstile.token ?? undefined }),
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
      turnstile.reset();
    }
  }

  return (
    <>
      {submitStatus === 'success' && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-2xl flex items-start gap-3 dark:bg-green-950/40 dark:border-green-800" role="alert">
          <CheckCircle2 className="h-5 w-5 text-green-700 mt-0.5 shrink-0 dark:text-green-300" aria-hidden="true" />
          <div>
            <p className="text-green-800 font-body font-semibold dark:text-green-200">Message sent successfully!</p>
            <p className="text-green-700 font-body text-sm mt-1 dark:text-green-300">
              {errorMessage || 'Thank you for your enquiry. A committee member will be in touch shortly.'}
            </p>
          </div>
        </div>
      )}

      {submitStatus === 'warning' && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-2xl flex items-start gap-3 dark:bg-yellow-950/40 dark:border-yellow-800" role="alert">
          <AlertTriangle className="h-5 w-5 text-yellow-800 mt-0.5 shrink-0 dark:text-yellow-300" aria-hidden="true" />
          <div>
            <p className="text-yellow-900 font-body font-semibold dark:text-yellow-100">Enquiry received</p>
            <p className="text-yellow-800 font-body text-sm mt-1 dark:text-yellow-200">
              {errorMessage || `Your enquiry was saved, but email notification failed. Please email ${urgentEmail} if urgent.`}
            </p>
          </div>
        </div>
      )}

      {submitStatus === 'error' && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 dark:bg-red-950/40 dark:border-red-800" role="alert">
          <XCircle className="h-5 w-5 text-red-700 mt-0.5 shrink-0 dark:text-red-300" aria-hidden="true" />
          <div>
            <p className="text-red-800 font-body font-semibold dark:text-red-200">Failed to send message</p>
            <p className="text-red-700 font-body text-sm mt-1 dark:text-red-300">{errorMessage}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-4">
        <input
          type="text"
          name="website"
          value={formData.hp_field}
          onChange={(e) => setFormData((prev) => ({ ...prev, hp_field: e.target.value }))}
          className="hidden"
          tabIndex={-1}
          autoComplete="off"
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

        <Textarea
          id="message"
          label="Message"
          required
          placeholder="Tell us how we can help..."
          rows={5}
          value={formData.message}
          onChange={(e) => setFormData((prev) => ({ ...prev, message: e.target.value }))}
        />

        <TurnstileWidget onToken={turnstile.setToken} resetKey={turnstile.resetKey} action="contact" message={turnstile.message} />

        <Button type="submit" isLoading={isSubmitting} size="lg" className="mt-1 w-full">
          {isSubmitting ? 'Sending...' : 'Send Message'}
        </Button>
      </form>
    </>
  );
}

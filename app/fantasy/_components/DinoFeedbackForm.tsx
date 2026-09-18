'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Input, { Select, Textarea } from '@/components/ui/Input';
import { FEEDBACK_KINDS } from '@/lib/dino-coach/feedback-input';

export default function DinoFeedbackForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [kind, setKind] = useState('issue');
  const [message, setMessage] = useState('');
  const [hpField, setHpField] = useState('');
  const [submittedAt, setSubmittedAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reference, setReference] = useState('');
  const attempt = useRef<{ signature: string; id: string } | null>(null);
  useEffect(() => setSubmittedAt(Date.now()), []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const values = { name: name.trim(), email: email.trim(), kind, message: message.trim() };
      const signature = JSON.stringify(values);
      if (attempt.current?.signature !== signature) attempt.current = { signature, id: crypto.randomUUID() };
      const response = await fetch('/api/fantasy/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, id: attempt.current!.id, hpField, submittedAt }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Your feedback could not be saved. Please try again.');
      setReference(result.reference);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your feedback could not be saved. Please try again.');
    } finally { setBusy(false); }
  }

  if (reference) return <div className="rounded-xl border border-edge-subtle bg-surface-elevated p-6">
    <p role="status" className="font-semibold">Thanks, we&apos;ve received your feedback.</p>
    <p className="mt-2 text-content-secondary">Saj and Rick will review it. If we need more information, we&apos;ll reply to the email you provided.</p>
    <p className="mt-3 break-all text-xs text-content-muted">Reference: {reference}</p>
    <Link href="/fantasy" className="btn-secondary mt-5 inline-flex">Back to Dino Coach</Link>
  </div>;

  return <form onSubmit={submit} className="space-y-5 rounded-xl border border-edge-subtle bg-surface-elevated p-5 sm:p-6" aria-busy={busy}>
    <fieldset disabled={busy} className="space-y-5">
      <legend className="sr-only">Your Dino Coach feedback</legend>
      <Input id="feedback-name" label="Your name" autoComplete="name" required maxLength={100} value={name} onChange={event => setName(event.target.value)} />
      <Input id="feedback-email" label="Your email - so we can reply" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} />
      <Select id="feedback-kind" label="What would you like to share?" required options={[...FEEDBACK_KINDS]} value={kind} onChange={event => setKind(event.target.value)} />
      <Textarea id="feedback-message" label="Your message" required minLength={10} maxLength={5000} rows={6} aria-describedby="feedback-help" value={message} onChange={event => setMessage(event.target.value)} />
      <p id="feedback-help" className="text-sm text-content-muted">If something went wrong, tell us which page you were on and what happened. Please don&apos;t include passwords or payment details.</p>
      <div hidden aria-hidden="true"><label htmlFor="feedback-website">Leave this field empty</label><input id="feedback-website" name="website" tabIndex={-1} autoComplete="off" value={hpField} onChange={event => setHpField(event.target.value)} /></div>
    </fieldset>
    {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
    <p className="text-sm text-content-muted">Your feedback is private and won&apos;t be published on the site. You don&apos;t need to sign in.</p>
    <Button type="submit" isLoading={busy} disabled={!submittedAt}>Send feedback</Button>
  </form>;
}

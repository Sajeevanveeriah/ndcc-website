'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';

type EmailStatus = {
  resendApiKeyPresent: boolean;
  resendFromPresent: boolean;
  resendFromSource: string;
  resendFromValid: boolean;
  resendFromPreview: string | null;
  contactToPresent?: boolean;
  effectiveContactRecipientPreview?: string | null;
  contactFallbackUsed?: boolean;
  contactReady?: boolean;
  testMode?: boolean;
  ready: boolean;
};

export default function AdminEmailDiagnosticsPage() {
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [recipient, setRecipient] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    adminFetch('/api/admin/email-diagnostics', { cache: 'no-store' })
      .then((res) => parseApiResponse<{ data: EmailStatus }>(res))
      .then((data) => setStatus(data.data))
      .catch((error) => setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load email diagnostics.' }));
  }, []);

  async function sendTest(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setFeedback(null);
    try {
      const res = await adminFetch('/api/admin/email-diagnostics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: recipient }),
      });
      const data = await parseApiResponse<{ status: 'sent' | 'skipped'; reason?: string; id?: string }>(res);
      setFeedback({
        type: 'success',
        message: data.status === 'sent'
          ? `Test email sent${data.id ? ` (Resend id ${data.id})` : ''}. Check the recipient inbox and Resend logs.`
          : `Email send skipped: ${data.reason}`,
      });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Test email failed.' });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-900">Email Diagnostics</h1>
        <p className="text-gray-500 font-body mt-1">Check app transactional email configuration without exposing secret values.</p>
      </div>

      <section className="bg-white border rounded-xl p-5 space-y-3">
        <h2 className="text-lg font-semibold">App email status</h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div><dt className="text-gray-500">RESEND_API_KEY</dt><dd className="font-semibold">{status?.resendApiKeyPresent ? 'Present' : 'Missing'}</dd></div>
          <div><dt className="text-gray-500">Sender address</dt><dd className="font-semibold">{status?.resendFromPresent ? 'Present' : 'Missing'}</dd></div>
          <div><dt className="text-gray-500">Sender variable source</dt><dd className="font-semibold">{status?.resendFromSource ?? 'missing'}</dd></div>
          <div><dt className="text-gray-500">Sender format valid</dt><dd className="font-semibold">{status?.resendFromValid ? 'Yes' : 'No'}</dd></div>
          <div><dt className="text-gray-500">Sender preview</dt><dd className="font-semibold">{status?.resendFromPreview ?? 'Not available'}</dd></div>
          <div><dt className="text-gray-500">App email ready</dt><dd className="font-semibold">{status?.ready ? 'Yes' : 'No — sends will be skipped safely'}</dd></div>
          <div><dt className="text-gray-500">Contact recipient</dt><dd className="font-semibold">{status?.effectiveContactRecipientPreview ?? 'Not available'}{status?.contactFallbackUsed ? ' (fallback)' : ''}</dd></div>
          <div><dt className="text-gray-500">Contact notifications ready</dt><dd className="font-semibold">{status?.contactReady ? 'Yes' : 'No'}</dd></div>
          <div><dt className="text-gray-500">EMAIL_TEST_MODE</dt><dd className="font-semibold">{status?.testMode ? 'On — sends are simulated' : 'Off'}</dd></div>
        </dl>
        <p className="text-sm text-gray-600">Supabase Auth confirmation emails are separate. Verify those in Supabase Authentication SMTP settings and Resend SMTP logs.</p>
      </section>

      <section className="bg-white border rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold">Send test email</h2>
        <form onSubmit={sendTest} className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
          <Input id="test-recipient" label="Recipient email" type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} required />
          <Button type="submit" isLoading={sending}>Send test email</Button>
        </form>
        {feedback && <p className={`text-sm ${feedback.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>{feedback.message}</p>}
      </section>
    </div>
  );
}

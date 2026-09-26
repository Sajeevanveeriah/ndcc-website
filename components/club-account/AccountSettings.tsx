'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { getAccountBrowserClient } from '@/lib/account/browser';
import { clubAccountJsonFetch } from '@/lib/club-account/browser';
import type { DeletionRequestSummary } from '@/lib/club-account/account-data';

const dateLabel = (value: string) => new Date(value).toLocaleDateString('en-AU', { timeZone: 'Australia/Melbourne', day: 'numeric', month: 'long', year: 'numeric' });

export default function AccountSettings({ email }: { email: string }) {
  const [newEmail, setNewEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');
  const [emailError, setEmailError] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [deletion, setDeletion] = useState<DeletionRequestSummary | null>(null);
  const [deletionAvailable, setDeletionAvailable] = useState(false);
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [deletionError, setDeletionError] = useState('');

  useEffect(() => {
    let active = true;
    clubAccountJsonFetch<{ request: DeletionRequestSummary | null; available?: boolean }>('/api/club-account/deletion-request')
      .then(data => { if (active) { setDeletion(data.request); setDeletionAvailable(data.available !== false); } })
      .catch(() => { if (active) setDeletionAvailable(false); });
    return () => { active = false; };
  }, []);

  async function changeEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem('newEmail') as HTMLInputElement | null;
    const submitted = (input?.value ?? newEmail).trim().toLowerCase();
    setEmailError(''); setEmailMessage('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submitted)) { setEmailError('Enter a valid email address.'); return; }
    if (submitted === email.trim().toLowerCase()) { setEmailError('That is already your sign-in email.'); return; }
    setEmailBusy(true);
    try {
      const { error } = await getAccountBrowserClient().auth.updateUser({ email: submitted }, { emailRedirectTo: `${window.location.origin}/club-account` });
      if (error) throw error;
      setNewEmail('');
      setEmailMessage(`Check your inbox to confirm the change to ${submitted}. You may also need to confirm from your current email. Until then, keep signing in with ${email}.`);
    } catch (reason) { setEmailError(reason instanceof Error ? reason.message : 'Your email could not be changed. Please retry.'); }
    finally { setEmailBusy(false); }
  }

  async function downloadData() {
    setExportBusy(true); setExportMessage('');
    try {
      const data = await clubAccountJsonFetch<Record<string, unknown>>('/api/club-account/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = 'NDCC-My-Club-Account.json';
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportMessage('Your data file has been downloaded.');
    } catch (reason) { setExportMessage(reason instanceof Error ? reason.message : 'Your data could not be downloaded. Please retry.'); }
    finally { setExportBusy(false); }
  }

  async function requestDeletion(event: React.FormEvent) {
    event.preventDefault(); setDeletionBusy(true); setDeletionError('');
    try {
      const result = await clubAccountJsonFetch<{ request: DeletionRequestSummary }>('/api/club-account/deletion-request', { method: 'POST', body: JSON.stringify({ confirm: true, reason }) });
      setDeletion(result.request); setDeletionOpen(false); setReason('');
    } catch (reason) { setDeletionError(reason instanceof Error ? reason.message : 'Your request could not be sent. Please retry.'); }
    finally { setDeletionBusy(false); }
  }

  return <div className="space-y-8 border-t border-edge-subtle pt-6">
    <section aria-labelledby="account-email-heading" className="space-y-3">
      <h3 id="account-email-heading" className="text-lg font-bold">Change my sign-in email</h3>
      <p className="text-sm text-content-secondary">Purchases are matched to your sign-in email, so orders placed with your previous email will no longer show under My purchases.</p>
      <form onSubmit={changeEmail} className="space-y-3">
        <Input id="account-new-email" name="newEmail" type="email" label="New email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={newEmail} onChange={event => setNewEmail(event.target.value)} required />
        {emailError && <p role="alert" className="text-sm">{emailError}</p>}
        {emailMessage && <p role="status" className="rounded-lg border border-green-300 p-3 text-sm">{emailMessage}</p>}
        <Button type="submit" variant="secondary" isLoading={emailBusy}>Change my email</Button>
      </form>
    </section>
    <section aria-labelledby="account-data-heading" className="space-y-3">
      <h3 id="account-data-heading" className="text-lg font-bold">Download my data</h3>
      <p className="text-sm text-content-secondary">Download your saved details, interests and website purchases as a JSON file.</p>
      <Button type="button" variant="secondary" isLoading={exportBusy} onClick={() => void downloadData()}>Download my data</Button>
      {exportMessage && <p role="status" className="text-sm">{exportMessage}</p>}
    </section>
    {(deletionAvailable || deletion) && <section aria-labelledby="account-delete-heading" className="space-y-3">
      <h3 id="account-delete-heading" className="text-lg font-bold">Delete my account</h3>
      {deletion?.status === 'pending' ? <p role="status" className="rounded-lg bg-surface-muted p-3 text-sm">Your deletion request was sent on {dateLabel(deletion.created_at)} and is waiting for the club to action it. <Link className="underline" href="/contact">Contact the club</Link> if you change your mind.</p>
        : <>
          {deletion?.status === 'actioned' && <p className="text-sm">Your previous deletion request was actioned{deletion.actioned_at ? ` on ${dateLabel(deletion.actioned_at)}` : ''}.</p>}
          <p className="text-sm text-content-secondary">Ask the club to delete your website account. Order, payment and raffle records are kept as the club&apos;s financial records.</p>
          {!deletionOpen ? <Button type="button" variant="secondary" onClick={() => setDeletionOpen(true)}>Request account deletion</Button>
            : <form onSubmit={requestDeletion} className="space-y-3">
              <label className="block text-sm">Reason (optional)<textarea className="form-input mt-1 w-full" rows={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>
              {deletionError && <p role="alert" className="text-sm">{deletionError}</p>}
              <div className="flex flex-wrap gap-3"><Button type="submit" isLoading={deletionBusy}>Send deletion request</Button><Button type="button" variant="secondary" disabled={deletionBusy} onClick={() => setDeletionOpen(false)}>Cancel</Button></div>
            </form>}
        </>}
    </section>}
  </div>;
}

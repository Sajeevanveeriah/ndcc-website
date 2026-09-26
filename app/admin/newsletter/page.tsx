'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input, { Textarea } from '@/components/ui/Input';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';

type SendRow = { id: string; subject: string; recipient_count: number; status: 'sending' | 'sent' | 'partial' | 'failed'; created_at: string; completed_at: string | null };
type Overview = {
  email_ready: boolean;
  test_mode: boolean;
  unsubscribe_ready: boolean;
  recipient_count: number | null;
  sends: SendRow[];
  log_available: boolean;
  sender_email: string;
};
type Progress = { sendId: string; total: number; remaining: number; sent: number; failed: number; skipped: number; running: boolean; status: string };

const STATUS_BADGE: Record<SendRow['status'], { label: string; variant: 'success' | 'warning' | 'danger' | 'info' }> = {
  sending: { label: 'Not finished', variant: 'warning' },
  sent: { label: 'Sent', variant: 'success' },
  partial: { label: 'Partly sent', variant: 'warning' },
  failed: { label: 'Failed', variant: 'danger' },
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function AdminNewsletterPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [busy, setBusy] = useState<'' | 'preview' | 'test' | 'create'>('');
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const stopRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const response = await adminFetch('/api/admin/newsletter', { cache: 'no-store' });
      setOverview(await parseApiResponse<Overview>(response));
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'The newsletter page could not be loaded.' });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function post<T>(payload: Record<string, unknown>) {
    const response = await adminFetch('/api/admin/newsletter', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    return parseApiResponse<T>(response);
  }

  async function preview() {
    setBusy('preview'); setFeedback(null);
    try {
      const result = await post<{ html: string }>({ action: 'preview', subject, body });
      setPreviewHtml(result.html);
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Preview failed.' });
    } finally { setBusy(''); }
  }

  async function sendTest() {
    setBusy('test'); setFeedback(null);
    try {
      const result = await post<{ message: string }>({ action: 'test', subject, body });
      setFeedback({ type: 'success', message: result.message });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'The test email was not sent.' });
    } finally { setBusy(''); }
  }

  const runBatches = useCallback(async (sendId: string, total: number) => {
    stopRef.current = false;
    let totals = { sent: 0, failed: 0, skipped: 0 };
    setProgress({ sendId, total, remaining: total, ...totals, running: true, status: 'sending' });
    let failures = 0;
    while (!stopRef.current) {
      try {
        const result = await post<{ remaining: number; status: string; sent: number; failed: number; skipped: number }>({ action: 'batch', send_id: sendId });
        failures = 0;
        totals = { sent: totals.sent + result.sent, failed: totals.failed + result.failed, skipped: totals.skipped + result.skipped };
        setProgress({ sendId, total, remaining: result.remaining, ...totals, running: result.remaining > 0, status: result.status });
        if (result.remaining === 0) break;
        // Rows claimed by another open tab: wait for them rather than spinning.
        if (result.sent + result.failed + result.skipped === 0) await wait(3000);
      } catch (error) {
        failures += 1;
        if (failures >= 3) {
          setFeedback({ type: 'error', message: `${error instanceof Error ? error.message : 'Sending paused.'} Use Continue sending to resume; nobody is emailed twice.` });
          break;
        }
        await wait(3000 * failures);
      }
    }
    setProgress((current) => current ? { ...current, running: false } : current);
    await load();
  }, [load]);

  async function startSend() {
    if (!overview?.recipient_count || !confirmed) return;
    setBusy('create'); setFeedback(null);
    try {
      const result = await post<{ send_id: string; recipient_count: number }>({ action: 'create', subject, body, confirm_recipient_count: overview.recipient_count });
      setConfirming(false); setConfirmed(false);
      await runBatches(result.send_id, result.recipient_count);
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'The newsletter could not be started.' });
      await load();
    } finally { setBusy(''); }
  }

  const canCompose = Boolean(subject.trim() && body.trim());
  const sendingBlocked = !overview?.email_ready || !overview?.unsubscribe_ready || !overview?.recipient_count || !overview.log_available;
  const percent = progress && progress.total ? Math.round(((progress.total - progress.remaining) / progress.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Member Newsletter</h1>
        <p className="text-sm text-content-muted">Email club members who chose to receive club email updates in their club account. Every email includes a one-click unsubscribe link.</p>
      </div>
      {feedback && (
        <p role="status" className={`text-sm px-3 py-2 rounded border ${feedback.type === 'error' ? 'text-red-600 bg-red-50 border-red-200' : 'text-green-700 bg-green-50 border-green-200'}`}>{feedback.message}</p>
      )}
      {overview && (
        <div className="rounded-lg border border-edge-blue bg-surface-blue-subtle p-3 text-sm text-content-primary">
          <p><strong>Opted-in recipients:</strong> {overview.recipient_count === null ? 'unavailable right now' : overview.recipient_count}</p>
          {!overview.email_ready && <p className="mt-1">Email sending is not configured on this server, so only previews are available.</p>}
          {overview.test_mode && <p className="mt-1">Email test mode is on: sends are simulated, not delivered.</p>}
          {!overview.log_available && <p className="mt-1">Sending needs the latest database update.</p>}
        </div>
      )}

      <section className="space-y-3 rounded-xl border bg-surface-card p-4">
        <Input id="newsletter-subject" label="Subject" value={subject} maxLength={200} onChange={(event) => setSubject(event.target.value)} />
        <Textarea id="newsletter-body" label="Message" rows={14} value={body} onChange={(event) => setBody(event.target.value)} />
        <p className="text-xs text-content-muted">Formatting: leave a blank line between paragraphs. Start a line with # for a heading, or with - for a bullet point. Use **bold** and [link text](https://example.com) for links.</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => void preview()} isLoading={busy === 'preview'} disabled={!canCompose}>Preview</Button>
          <Button variant="secondary" onClick={() => void sendTest()} isLoading={busy === 'test'} disabled={!canCompose || !overview?.email_ready}>Send test to me{overview?.sender_email ? ` (${overview.sender_email})` : ''}</Button>
          <Button onClick={() => { setConfirming(true); setConfirmed(false); setFeedback(null); }} disabled={!canCompose || sendingBlocked || Boolean(progress?.running)}>Send to members</Button>
        </div>
        {confirming && overview?.recipient_count ? (
          <div className="space-y-3 rounded-lg border-2 border-maroon-700 p-4" role="alertdialog" aria-labelledby="newsletter-confirm-title">
            <h2 id="newsletter-confirm-title" className="font-semibold">Send &quot;{subject.trim()}&quot; to {overview.recipient_count} member{overview.recipient_count === 1 ? '' : 's'}?</h2>
            <p className="text-sm text-content-secondary">This cannot be undone. Preview it and send yourself a test first.</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
              I have checked the preview and want to email {overview.recipient_count} member{overview.recipient_count === 1 ? '' : 's'} now.
            </label>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
              <Button variant="danger" onClick={() => void startSend()} isLoading={busy === 'create'} disabled={!confirmed}>Send to {overview.recipient_count} member{overview.recipient_count === 1 ? '' : 's'}</Button>
            </div>
          </div>
        ) : null}
        {progress && (
          <div className="space-y-2" aria-live="polite">
            <div className="h-3 w-full overflow-hidden rounded bg-surface-page" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Newsletter sending progress">
              <div className="h-full bg-maroon-700" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-sm">{progress.running ? 'Sending... keep this page open.' : progress.remaining === 0 ? 'Finished.' : 'Paused.'} Sent {progress.sent}, failed {progress.failed}, skipped {progress.skipped}, remaining {progress.remaining}.</p>
            {progress.running && <Button variant="secondary" size="sm" onClick={() => { stopRef.current = true; }}>Pause sending</Button>}
          </div>
        )}
      </section>

      {previewHtml && (
        <section className="space-y-2">
          <h2 className="font-semibold">Preview</h2>
          <iframe title="Newsletter email preview" sandbox="" srcDoc={previewHtml} className="h-[600px] w-full rounded-lg border border-edge-subtle bg-white" />
        </section>
      )}

      {overview && overview.sends.length > 0 && (
        <section className="rounded-xl border bg-surface-card p-4">
          <h2 className="mb-3 font-semibold">Recent newsletters</h2>
          <ul className="divide-y divide-edge-subtle">
            {overview.sends.map((send) => (
              <li key={send.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{send.subject} <Badge variant={STATUS_BADGE[send.status].variant}>{STATUS_BADGE[send.status].label}</Badge></p>
                  <p className="text-xs text-content-muted">{new Date(send.created_at).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' })} - {send.recipient_count} recipient{send.recipient_count === 1 ? '' : 's'}</p>
                </div>
                {send.status === 'sending' && !progress?.running && (
                  <Button variant="secondary" size="sm" onClick={() => void runBatches(send.id, send.recipient_count)}>Continue sending</Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

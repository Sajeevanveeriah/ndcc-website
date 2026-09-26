'use client';

import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';

type EventInfo = { type: string; label: string; description: string };
type Recipient = { id: string; event_type: string; email: string; name: string | null; active: boolean };
type ListResponse = { available: boolean; message?: string; events: EventInfo[]; recipients: Recipient[]; contactOverride: boolean };

function AddRecipientForm({ event, busy, onAdd }: { event: EventInfo; busy: boolean; onAdd: (eventType: string, email: string, name: string) => Promise<boolean> }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  return (
    <form
      className="mt-4 grid gap-3 sm:grid-cols-[2fr_1.5fr_auto] sm:items-end"
      onSubmit={async (formEvent) => {
        formEvent.preventDefault();
        if (await onAdd(event.type, email, name)) { setEmail(''); setName(''); }
      }}
    >
      <Input id={`add-email-${event.type}`} label="Email address" type="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
      <Input id={`add-name-${event.type}`} label="Name or role (optional)" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
      <Button type="submit" disabled={busy}>Add address</Button>
    </form>
  );
}

export default function NotificationRecipientsPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const result = await parseApiResponse<ListResponse>(await adminFetch('/api/admin/notifications'));
      if (!Array.isArray(result.events) || !Array.isArray(result.recipients)) throw new Error('Notification recipients returned an invalid response. Please retry.');
      setData(result);
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : 'Notification recipients could not be loaded. Please retry.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function mutate(request: () => Promise<Response>, success: string) {
    if (busy) return false;
    setBusy(true); setError(''); setMessage('');
    try {
      await parseApiResponse(await request());
      setMessage(success);
      await load();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The change could not be saved. Please try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const add = (eventType: string, email: string, name: string) => mutate(() => adminFetch('/api/admin/notifications', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_type: eventType, email, name }),
  }), `${email.trim().toLowerCase()} added. The change applies to the next email sent.`);

  const setActive = (recipient: Recipient, active: boolean) => mutate(() => adminFetch('/api/admin/notifications', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: recipient.id, active }),
  }), `${recipient.email} ${active ? 'will receive' : 'will no longer receive'} these emails.`);

  const remove = (recipient: Recipient, label: string) => {
    if (!window.confirm(`Remove ${recipient.email} from "${label}"?`)) return;
    void mutate(() => adminFetch(`/api/admin/notifications?id=${encodeURIComponent(recipient.id)}`, { method: 'DELETE' }), `${recipient.email} removed.`);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold">Notification emails</h1>
        <p className="mt-2 max-w-3xl text-content-muted">Choose which club addresses receive copies of emails the website sends. Changes apply to the next email, usually within a minute. If an email type has no active addresses, no club copy is sent for it.</p>
      </div>
      {message && <p role="status" className="rounded border border-edge-subtle p-4">{message}</p>}
      {error && <p role="alert" className="rounded border border-red-200 p-4 text-red-700 dark:text-red-300">{error}</p>}
      {loadError && <div role="alert" className="rounded border border-edge-subtle p-4"><p>{loadError}</p><Button className="mt-3" variant="secondary" onClick={() => void load()}>Retry</Button></div>}
      {!data && !loadError && <p role="status">Loading notification recipients...</p>}
      {data && !data.available && <p role="status" className="rounded border border-edge-subtle p-4">{data.message}</p>}
      {data?.available && data.events.map((event) => {
        const rows = data.recipients.filter((recipient) => recipient.event_type === event.type);
        return (
          <section key={event.type} aria-labelledby={`notifications-${event.type}`} className="rounded-lg border border-edge-subtle bg-surface-card p-6">
            <h2 id={`notifications-${event.type}`} className="text-xl font-semibold">{event.label}</h2>
            <p className="mt-1 text-sm text-content-muted">{event.description}</p>
            {event.type === 'contact' && data.contactOverride && (
              <p className="mt-2 text-sm">A server setting currently chooses the enquiry recipient, so this list is not used for website enquiries until that setting is removed.</p>
            )}
            {rows.length === 0 ? (
              <p className="mt-4 text-sm">No addresses. No club copy is sent for this email type.</p>
            ) : (
              <ul className="mt-4 divide-y divide-edge-subtle">
                {rows.map((recipient) => (
                  <li key={recipient.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-all font-medium">{recipient.email}</p>
                      <p className="text-sm text-content-muted">{recipient.name ? `${recipient.name} - ` : ''}{recipient.active ? 'Receiving these emails' : 'Paused (not receiving)'}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => void setActive(recipient, !recipient.active)}>{recipient.active ? 'Pause' : 'Resume'}</Button>
                      <Button size="sm" variant="danger" disabled={busy} onClick={() => remove(recipient, event.label)}>Remove</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <AddRecipientForm event={event} busy={busy} onAdd={add} />
          </section>
        );
      })}
    </div>
  );
}

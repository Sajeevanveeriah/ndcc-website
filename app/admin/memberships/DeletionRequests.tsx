'use client';
import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import { parseApiResponse, adminFetch } from '@/lib/admin-client';

type DeletionRequest = {
  id: string; email: string; reason: string | null; status: 'pending' | 'actioned'; created_at: string; actioned_at: string | null;
  member: { full_name: string; membership_status: string } | Array<{ full_name: string; membership_status: string }> | null;
};
const when = (value: string) => new Date(value).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' });

export default function DeletionRequests() {
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await parseApiResponse<{ requests: DeletionRequest[]; available?: boolean }>(await adminFetch('/api/admin/memberships/deletion-requests', { cache: 'no-store' }));
      setRequests(data.requests || []); setAvailable(data.available !== false);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Failed to load deletion requests.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const markActioned = async (id: string) => {
    setBusy(id); setMessage('');
    try {
      await parseApiResponse(await adminFetch('/api/admin/memberships/deletion-requests', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'actioned' }) }));
      setMessage('Deletion request marked as actioned.'); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Failed to update the deletion request.'); }
    finally { setBusy(''); }
  };
  return <div className="bg-surface-card border rounded-xl p-4">
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 className="font-display font-bold">Account deletion requests{requests.some(item => item.status === 'pending') ? ` (${requests.filter(item => item.status === 'pending').length} pending)` : ''}</h2>
      <Button size="sm" variant="secondary" onClick={load} isLoading={loading}>Refresh</Button>
    </div>
    <p className="text-sm text-content-muted mb-3">Members ask here for their website account to be deleted. Keep order, payment and raffle records. Mark a request actioned once it has been handled.</p>
    {message && <p role="status" className="text-sm mb-3">{message}</p>}
    {!available ? <p className="text-sm text-content-secondary">Deletion requests are not available until the latest database update is applied.</p>
      : <ul className="space-y-3 text-sm text-content-secondary">
        {requests.map(item => {
          const member = Array.isArray(item.member) ? item.member[0] : item.member;
          return <li key={item.id} className="rounded-lg border border-edge-subtle p-3 space-y-1">
            <p><strong className="text-content-primary">{member?.full_name || item.email}</strong> · {item.email}{member ? ` · club record ${member.membership_status}` : ''}</p>
            <p>Requested {when(item.created_at)} · {item.status === 'pending' ? 'Pending' : `Actioned${item.actioned_at ? ` ${when(item.actioned_at)}` : ''}`}</p>
            {item.reason && <p className="whitespace-pre-line break-words">Reason: {item.reason}</p>}
            {item.status === 'pending' && <Button size="sm" onClick={() => markActioned(item.id)} isLoading={busy === item.id}>Mark actioned</Button>}
          </li>;
        })}
        {!loading && requests.length === 0 && <li>No deletion requests.</li>}
      </ul>}
  </div>;
}

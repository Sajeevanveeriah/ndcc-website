'use client';

import { useState } from 'react';

type Revision = { id: string; revision: number; changed_at: string; action: string; snapshot: Record<string, unknown> };

export default function EditorialHistory({ resource, id, onSelect }: { resource: string; id: string; onSelect: (snapshot: Record<string, unknown>) => void }) {
  const [history, setHistory] = useState<Revision[]>([]);
  const [message, setMessage] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/admin/resources/${resource}?history=${encodeURIComponent(id)}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'History unavailable.');
      setHistory(result.data || []); setLoaded(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'History unavailable.'); }
    finally { setBusy(false); }
  }
  return <div className="my-4 rounded border border-edge-subtle p-3 text-sm">
    <button type="button" className="min-h-11 font-semibold underline" onClick={load} disabled={busy}>{busy ? 'Loading...' : 'View previous versions'}</button>
    <p className="text-content-muted">Load a saved version into this form, review it, then save. Version history starts with this update.</p>
    {message && <p role="status">{message}</p>}
    {loaded && history.length === 0 && <p className="mt-2">No earlier versions recorded.</p>}
    <ul className="mt-2 space-y-2">{history.map((entry) => <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-edge-subtle pt-2">
      <span>Version {entry.revision} - {new Date(entry.changed_at).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' })}</span>
      <button type="button" className="min-h-11 underline" onClick={() => onSelect(entry.snapshot)}>Load into form</button>
    </li>)}</ul>
  </div>;
}

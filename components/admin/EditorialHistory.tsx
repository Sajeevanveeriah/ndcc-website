'use client';

import { useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { diffSnapshots, fieldLabel, formatDiffValue } from '@/lib/revisions/diff';

type Revision = {
  id: string;
  revision: number;
  changed_at: string;
  action: string;
  snapshot: Record<string, unknown>;
  changed_by?: string | null;
  changed_by_name?: string;
};

function formatWhen(value: string) {
  return new Date(value).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' });
}

export default function EditorialHistory({ resource, id, onSelect }: { resource: string; id: string; onSelect: (snapshot: Record<string, unknown>) => void }) {
  const [history, setHistory] = useState<Revision[]>([]);
  const [current, setCurrent] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [compareId, setCompareId] = useState<string | null>(null);
  async function load() {
    setBusy(true); setMessage('');
    try {
      const response = await adminFetch(`/api/admin/resources/${resource}?history=${encodeURIComponent(id)}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'History unavailable.');
      setHistory(result.data || []);
      setCurrent(result.current && typeof result.current === 'object' ? result.current : null);
      setLoaded(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'History unavailable.'); }
    finally { setBusy(false); }
  }
  function restore(entry: Revision) {
    onSelect(entry.snapshot);
    setMessage(`Version ${entry.revision} is loaded into the form. Review it, then save to restore it.`);
  }
  return <div className="my-4 rounded border border-edge-subtle p-3 text-sm">
    <button type="button" className="min-h-11 font-semibold underline" onClick={load} disabled={busy}>{busy ? 'Loading...' : loaded ? 'Refresh previous versions' : 'View previous versions'}</button>
    <p className="text-content-muted">Compare a saved version with the current one, or restore it into this form to review and save. Version history starts with this update.</p>
    {message && <p role="status" className="mt-2">{message}</p>}
    {loaded && history.length === 0 && <p className="mt-2">No earlier versions recorded.</p>}
    <ul className="mt-2 space-y-2">{history.map((entry) => {
      const comparing = compareId === entry.id;
      const changes = comparing && current ? diffSnapshots(entry.snapshot, current) : [];
      return <li key={entry.id} className="border-t border-edge-subtle pt-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            <span className="font-semibold">Version {entry.revision}</span>
            {' - '}in use until {formatWhen(entry.changed_at)}
            {entry.changed_by_name ? <>, changed by {entry.changed_by_name}</> : null}
            {entry.action === 'DELETE' ? <> (deleted)</> : null}
          </span>
          <span className="flex flex-wrap gap-3">
            <button type="button" className="min-h-11 underline" aria-expanded={comparing} onClick={() => setCompareId(comparing ? null : entry.id)}>{comparing ? 'Hide comparison' : 'Compare with current'}</button>
            <button type="button" className="min-h-11 font-semibold underline" onClick={() => restore(entry)}>Restore this version</button>
          </span>
        </div>
        {comparing && (!current
          ? <p className="mt-2 text-content-muted">The current saved version could not be loaded for comparison.</p>
          : changes.length === 0
            ? <p className="mt-2 text-content-muted">This version matches the current saved version.</p>
            : <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[32rem] border-collapse text-left text-xs">
                <caption className="sr-only">Differences between version {entry.revision} and the current saved version</caption>
                <thead><tr className="border-b border-edge-subtle">
                  <th scope="col" className="py-1 pr-2 font-semibold">Field</th>
                  <th scope="col" className="py-1 pr-2 font-semibold">Version {entry.revision}</th>
                  <th scope="col" className="py-1 font-semibold">Current</th>
                </tr></thead>
                <tbody>{changes.map((change) => <tr key={change.field} className="border-b border-edge-subtle align-top">
                  <th scope="row" className="py-1 pr-2 font-medium">{fieldLabel(change.field)}</th>
                  <td className="whitespace-pre-wrap break-words py-1 pr-2 text-red-800 dark:text-red-200"><span className="sr-only">Old value: </span>{formatDiffValue(change.before)}</td>
                  <td className="whitespace-pre-wrap break-words py-1 text-green-800 dark:text-green-200"><span className="sr-only">Current value: </span>{formatDiffValue(change.after)}</td>
                </tr>)}</tbody>
              </table>
            </div>)}
      </li>;
    })}</ul>
  </div>;
}

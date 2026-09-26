'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';

type TrashItem = {
  revision_id: string;
  table: string;
  section: string;
  href: string;
  record_id: string;
  title: string;
  deleted_at: string;
  deleted_by: string | null;
};

type TrashResponse = { items: TrashItem[]; retentionDays: number; sections: Array<{ table: string; label: string }> };

function formatWhen(value: string) {
  return new Date(value).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' });
}

export default function TrashPage() {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [sections, setSections] = useState<Array<{ table: string; label: string }>>([]);
  const [retentionDays, setRetentionDays] = useState(90);
  const [table, setTable] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async (selectedTable: string) => {
    setLoading(true);
    try {
      const response = await adminFetch(`/api/admin/trash${selectedTable ? `?table=${encodeURIComponent(selectedTable)}` : ''}`);
      const data = await parseApiResponse<TrashResponse>(response);
      setItems(data.items || []);
      if (data.sections?.length) setSections(data.sections);
      if (data.retentionDays) setRetentionDays(data.retentionDays);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Trash could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(table); }, [load, table]);

  async function restore(item: TrashItem) {
    if (!window.confirm(`Restore "${item.title}" to ${item.section}? It returns exactly as it was when deleted, including whether it was published.`)) return;
    setRestoringId(item.revision_id);
    setMessage('');
    try {
      const response = await adminFetch('/api/admin/trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision_id: item.revision_id }),
      });
      const result = await parseApiResponse<{ droppedColumns?: string[] }>(response);
      setItems((current) => current.filter((entry) => entry.revision_id !== item.revision_id));
      const skipped = result.droppedColumns?.length ? ` Retired fields were skipped: ${result.droppedColumns.join(', ')}.` : '';
      setMessage(`Restored "${item.title}" to ${item.section}.${skipped}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Restore failed.');
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Trash</h1>
        <p className="mt-1 text-sm text-content-muted">
          Records deleted from news, publications, events, page sections, sponsors, teams, appointments, gallery, pages and links, history, committee, merchandise, kitchen and membership plans are archived here.
          Deletions older than {retentionDays} days are hidden from this list but are not erased.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium text-content-secondary">Section
          <select className="mt-1 block w-64 max-w-full rounded-lg border border-edge-strong bg-surface-card px-3 py-2" value={table} onChange={(event) => setTable(event.target.value)}>
            <option value="">All sections</option>
            {sections.map((section) => <option key={section.table} value={section.table}>{section.label}</option>)}
          </select>
        </label>
        <Button type="button" variant="secondary" size="sm" onClick={() => void load(table)} disabled={loading}>Refresh</Button>
      </div>

      {message && <p className="text-sm" role="status">{message}</p>}

      <div className="rounded-xl border bg-surface-card">
        {loading ? <p className="p-4 text-sm text-content-muted">Loading deleted records...</p>
          : items.length === 0 ? <p className="p-4 text-sm text-content-muted">No deleted records in the last {retentionDays} days.</p>
            : <ul className="divide-y">
              {items.map((item) => (
                <li key={item.revision_id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold break-words">{item.title}</p>
                    <p className="text-sm text-content-muted">
                      <Link className="underline" href={item.href}>{item.section}</Link>
                      {' - '}deleted {formatWhen(item.deleted_at)}{item.deleted_by ? ` by ${item.deleted_by}` : ''}
                    </p>
                  </div>
                  <Button type="button" size="sm" onClick={() => void restore(item)} isLoading={restoringId === item.revision_id} disabled={Boolean(restoringId)}>Restore</Button>
                </li>
              ))}
            </ul>}
      </div>
      <p className="text-xs text-content-muted">Restoring puts the record back with its original details. If it belonged to something that was also deleted (for example a kitchen item whose menu was deleted), restore that first.</p>
    </div>
  );
}

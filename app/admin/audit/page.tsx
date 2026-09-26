'use client';

import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';
import { RESOURCE_PERMISSIONS } from '@/lib/auth/permissions';

type AuditEntry = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  resource: string;
  record_id: string | null;
  summary: string;
  created_at: string;
};

type Filters = { resource: string; actor: string; from: string; to: string };
const EMPTY_FILTERS: Filters = { resource: '', actor: '', from: '', to: '' };
const KNOWN_RESOURCES = [...Object.keys(RESOURCE_PERMISSIONS), 'users', 'bankTransfers'].sort();

function formatWhen(value: string) {
  return new Date(value).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' });
}

export default function AuditLogPage() {
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = useCallback(async (nextFilters: Filters, nextPage: number) => {
    setLoading(true);
    setMessage('');
    const params = new URLSearchParams({ page: String(nextPage) });
    for (const [key, value] of Object.entries(nextFilters)) if (value.trim()) params.set(key, value.trim());
    try {
      const response = await adminFetch(`/api/admin/audit?${params.toString()}`);
      const data = await parseApiResponse<{ entries: AuditEntry[]; total: number; pageSize: number }>(response);
      setEntries(data.entries || []);
      setTotal(data.total || 0);
      if (data.pageSize) setPageSize(data.pageSize);
    } catch (error) {
      setEntries([]);
      setTotal(0);
      setMessage(error instanceof Error ? error.message : 'The audit log could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(filters, page); }, [filters, load, page]);

  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  const inputClass = 'mt-1 block w-full rounded-lg border border-edge-strong bg-surface-card px-3 py-2';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Audit log</h1>
        <p className="mt-1 text-sm text-content-muted">Who changed what in the CMS: creates, updates, deletes, restores, user access changes and bank transfer confirmations. Newest first.</p>
      </div>

      <form
        className="grid gap-3 rounded-xl border bg-surface-card p-4 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={(event) => { event.preventDefault(); setPage(0); setFilters({ ...draft }); }}
      >
        <label className="text-sm font-medium text-content-secondary">Section
          <input className={inputClass} list="audit-resources" value={draft.resource} onChange={(event) => setDraft({ ...draft, resource: event.target.value })} />
          <datalist id="audit-resources">{KNOWN_RESOURCES.map((resource) => <option key={resource} value={resource} />)}</datalist>
        </label>
        <label className="text-sm font-medium text-content-secondary">Person (email contains)
          <input className={inputClass} value={draft.actor} onChange={(event) => setDraft({ ...draft, actor: event.target.value })} />
        </label>
        <label className="text-sm font-medium text-content-secondary">From
          <input type="date" className={inputClass} value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} />
        </label>
        <label className="text-sm font-medium text-content-secondary">To
          <input type="date" className={inputClass} value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} />
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit" size="sm">Apply</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => { setDraft(EMPTY_FILTERS); setPage(0); setFilters(EMPTY_FILTERS); }}>Clear</Button>
        </div>
      </form>

      {message && <p className="text-sm" role="status">{message}</p>}

      <div className="overflow-x-auto rounded-xl border bg-surface-card">
        {loading ? <p className="p-4 text-sm text-content-muted">Loading audit entries...</p>
          : entries.length === 0 ? <p className="p-4 text-sm text-content-muted">No audit entries match these filters.</p>
            : <table className="w-full min-w-[44rem] text-left text-sm">
              <caption className="sr-only">Admin audit entries</caption>
              <thead className="border-b">
                <tr>
                  <th scope="col" className="p-3 font-semibold">When</th>
                  <th scope="col" className="p-3 font-semibold">Who</th>
                  <th scope="col" className="p-3 font-semibold">Action</th>
                  <th scope="col" className="p-3 font-semibold">Section</th>
                  <th scope="col" className="p-3 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {entries.map((entry) => (
                  <tr key={entry.id} className="align-top">
                    <td className="whitespace-nowrap p-3">{formatWhen(entry.created_at)}</td>
                    <td className="p-3 break-all">{entry.actor_email || 'Unknown'}</td>
                    <td className="p-3">{entry.action.replace(/_/g, ' ')}</td>
                    <td className="p-3">{entry.resource}</td>
                    <td className="p-3 break-words">
                      {entry.summary}
                      {entry.record_id && <span className="block text-xs text-content-muted">Record {entry.record_id}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-content-muted">{total} {total === 1 ? 'entry' : 'entries'}{total > 0 ? ` - page ${page + 1} of ${lastPage + 1}` : ''}</p>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="secondary" disabled={loading || page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</Button>
          <Button type="button" size="sm" variant="secondary" disabled={loading || page >= lastPage} onClick={() => setPage((value) => Math.min(lastPage, value + 1))}>Next</Button>
        </div>
      </div>
    </div>
  );
}

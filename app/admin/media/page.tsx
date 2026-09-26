'use client';

import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';

type Asset = {
  id: string;
  path: string;
  public_url: string;
  alt_text: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  content_type: string | null;
  usage_hint: string | null;
  created_at: string;
};

const PAGE_SIZE = 48;

function formatBytes(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const isPdf = (asset: Asset) => asset.path.toLowerCase().endsWith('.pdf');

export default function AdminMediaLibraryPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [total, setTotal] = useState(0);
  const [available, setAvailable] = useState(true);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | 'image' | 'pdf'>('all');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [altDraft, setAltDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const load = useCallback(async (offset: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ kind, limit: String(PAGE_SIZE), offset: String(offset) });
      if (query) params.set('q', query);
      const response = await adminFetch(`/api/admin/media?${params.toString()}`, { cache: 'no-store' });
      const result = await parseApiResponse<{ data?: Asset[]; total?: number; available?: boolean }>(response);
      setAvailable(result.available !== false);
      setTotal(result.total ?? 0);
      setAssets((current) => (offset === 0 ? result.data || [] : [...current, ...(result.data || [])]));
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'The media library could not be loaded.' });
    } finally {
      setLoading(false);
    }
  }, [kind, query]);

  useEffect(() => { void load(0); }, [load]);

  const choose = (asset: Asset) => {
    setSelected(asset);
    setAltDraft(asset.alt_text);
    setFeedback(null);
  };

  async function copyUrl(asset: Asset) {
    try {
      await navigator.clipboard.writeText(asset.public_url);
      setFeedback({ type: 'success', message: 'File URL copied.' });
    } catch {
      setFeedback({ type: 'error', message: 'Copy failed. Select the URL text and copy it manually.' });
    }
  }

  async function saveAlt() {
    if (!selected) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await adminFetch('/api/admin/media', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, alt_text: altDraft }),
      });
      const result = await parseApiResponse<{ data: { alt_text: string } }>(response);
      const next = { ...selected, alt_text: result.data.alt_text };
      setSelected(next);
      setAssets((current) => current.map((asset) => (asset.id === next.id ? next : asset)));
      setFeedback({ type: 'success', message: 'Alt text saved. Pages that already use this file keep their own alt text.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Alt text could not be saved.' });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!selected) return;
    if (!window.confirm('Delete this file permanently? It is only deleted if no page, article, event, sponsor or gallery item uses it.')) return;
    setDeleting(true);
    setFeedback(null);
    try {
      const response = await adminFetch(`/api/admin/media?id=${encodeURIComponent(selected.id)}`, { method: 'DELETE' });
      await parseApiResponse(response);
      setAssets((current) => current.filter((asset) => asset.id !== selected.id));
      setTotal((count) => Math.max(0, count - 1));
      setSelected(null);
      setFeedback({ type: 'success', message: 'File deleted.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'The file could not be deleted.' });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Media Library</h1>
        <p className="text-sm text-content-muted">Images and PDFs uploaded through the CMS. Copy a file URL, improve its alt text, or delete files that are no longer used anywhere.</p>
      </div>
      {feedback && (
        <p role="status" className={`text-sm px-3 py-2 rounded border ${feedback.type === 'error' ? 'text-red-600 bg-red-50 border-red-200' : 'text-green-700 bg-green-50 border-green-200'}`}>{feedback.message}</p>
      )}
      {!available && (
        <p className="rounded border border-edge-blue bg-surface-blue-subtle px-3 py-2 text-sm text-content-primary">The media library needs the latest database update. Uploads still work from each editor.</p>
      )}
      <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); }}>
        <div className="min-w-[240px] flex-1">
          <Input id="media-search" label="Search alt text, file name or usage note" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <label className="text-sm text-content-secondary">Type
          <select className="mt-1 block rounded-lg border border-edge-strong bg-surface-card px-3 py-2" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
            <option value="all">All files</option>
            <option value="image">Images</option>
            <option value="pdf">PDFs</option>
          </select>
        </label>
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {assets.length === 0 && !loading ? (
            <p className="text-sm text-content-muted">{query ? 'No files match your search.' : 'No files in the library yet.'}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-label="Library files">
              {assets.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    onClick={() => choose(asset)}
                    aria-pressed={selected?.id === asset.id}
                    className={`block w-full overflow-hidden rounded-lg border text-left ${selected?.id === asset.id ? 'border-maroon-600 ring-2 ring-maroon-500' : 'border-edge-subtle hover:border-edge-strong'}`}
                  >
                    {isPdf(asset) ? (
                      <span className="flex h-28 w-full items-center justify-center bg-surface-page text-sm text-content-muted">PDF</span>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={asset.public_url} alt={asset.alt_text || 'Library image without alt text'} className="h-28 w-full object-cover" loading="lazy" />
                    )}
                    <span className="block truncate px-2 py-1 text-xs text-content-secondary">{asset.alt_text || 'No alt text yet'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {loading && <p className="mt-3 text-sm text-content-muted">Loading files...</p>}
          {!loading && assets.length < total && (
            <Button className="mt-4" variant="secondary" onClick={() => void load(assets.length)}>Load more ({total - assets.length} remaining)</Button>
          )}
        </div>
        <aside className="space-y-3 rounded-xl border bg-surface-card p-4">
          {!selected ? (
            <p className="text-sm text-content-muted">Select a file to see its details.</p>
          ) : (
            <>
              {!isPdf(selected) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selected.public_url} alt={selected.alt_text || 'Selected library image'} className="max-h-56 w-full rounded border border-edge-subtle object-contain bg-surface-page" />
              )}
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                {selected.width && selected.height ? (<><dt className="text-content-muted">Size</dt><dd>{selected.width} x {selected.height}px</dd></>) : null}
                {selected.bytes ? (<><dt className="text-content-muted">File</dt><dd>{formatBytes(selected.bytes)}</dd></>) : null}
                <dt className="text-content-muted">Added</dt><dd>{new Date(selected.created_at).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' })}</dd>
                {selected.usage_hint ? (<><dt className="text-content-muted">Used for</dt><dd>{selected.usage_hint}</dd></>) : null}
              </dl>
              <label className="block text-xs text-content-secondary" htmlFor="media-url">File URL</label>
              <input id="media-url" readOnly value={selected.public_url} className="w-full rounded border border-edge-strong bg-surface-page px-2 py-1 text-xs" onFocus={(event) => event.target.select()} />
              <Button variant="secondary" size="sm" onClick={() => void copyUrl(selected)}>Copy URL</Button>
              {!isPdf(selected) && (
                <>
                  <Input id="media-alt" label="Alt text (describe the image for screen readers)" value={altDraft} maxLength={300} onChange={(event) => setAltDraft(event.target.value)} />
                  <p className="text-xs text-content-muted">Used as the suggested alt text when this image is chosen from the library.</p>
                  <Button size="sm" onClick={() => void saveAlt()} isLoading={saving} disabled={altDraft === selected.alt_text}>Save alt text</Button>
                </>
              )}
              <div className="border-t border-edge-subtle pt-3">
                <Button variant="danger" size="sm" onClick={() => void remove()} isLoading={deleting}>Delete file</Button>
                <p className="mt-1 text-xs text-content-muted">Files still used by news, events, sponsors, gallery, page sections or other content cannot be deleted.</p>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

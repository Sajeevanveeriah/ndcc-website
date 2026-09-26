'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';

export type LibraryAsset = {
  id: string;
  path: string;
  public_url: string;
  alt_text: string;
  width: number | null;
  height: number | null;
  content_type: string | null;
  created_at: string;
};

type Props = {
  kind: 'image' | 'pdf';
  onPick: (asset: LibraryAsset) => void;
  onClose: () => void;
};

/**
 * Inline chooser for files already in the media library. Rendered inside the
 * editor (not as a second modal) so it works within existing edit dialogs.
 */
export default function MediaLibraryPicker({ kind, onPick, onClose }: Props) {
  const [search, setSearch] = useState('');
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = useCallback(async (query: string) => {
    setLoading(true);
    setMessage('');
    try {
      const params = new URLSearchParams({ kind, limit: '48' });
      if (query.trim()) params.set('q', query.trim());
      const response = await adminFetch(`/api/admin/media?${params.toString()}`, { cache: 'no-store' });
      const result = await parseApiResponse<{ data?: LibraryAsset[]; available?: boolean }>(response);
      setAssets(result.data || []);
      if (result.available === false) setMessage('The media library is not set up yet. Upload a file instead.');
      else if (!result.data?.length) setMessage(query.trim() ? 'No library files match your search.' : 'No files in the library yet.');
    } catch (error) {
      setAssets([]);
      setMessage(error instanceof Error ? error.message : 'The media library could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => { void load(''); }, [load]);

  return (
    <div className="space-y-2 rounded-lg border border-edge-strong bg-surface-page p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`media-library-search-${kind}`}>Search the media library</label>
        <input
          id={`media-library-search-${kind}`}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void load(search); } }}
          placeholder="Search by alt text or file name"
          className="min-w-0 flex-1 rounded border border-edge-strong bg-surface-card px-2 py-1 text-sm"
        />
        <button type="button" className="rounded border border-edge-strong px-3 py-1 text-xs hover:bg-surface-card" onClick={() => void load(search)}>Search</button>
        <button type="button" className="rounded border border-edge-strong px-3 py-1 text-xs hover:bg-surface-card" onClick={onClose}>Close library</button>
      </div>
      {loading ? <p className="text-xs text-content-muted">Loading library...</p> : message ? <p className="text-xs text-content-muted">{message}</p> : null}
      {!loading && assets.length > 0 && (
        <ul className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4" aria-label="Media library files">
          {assets.map((asset) => (
            <li key={asset.id}>
              <button
                type="button"
                onClick={() => onPick(asset)}
                className="group block w-full overflow-hidden rounded border border-edge-subtle text-left hover:border-maroon-600 focus:outline-none focus:ring-2 focus:ring-maroon-500"
                title={asset.alt_text || asset.path}
              >
                {kind === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={asset.public_url} alt={asset.alt_text || 'Library image without alt text'} className="h-20 w-full object-cover" loading="lazy" />
                ) : (
                  <span className="flex h-20 w-full items-center justify-center bg-surface-card text-xs text-content-muted">PDF</span>
                )}
                <span className="block truncate px-1 py-0.5 text-[11px] text-content-secondary">{asset.alt_text || asset.path.split('/').pop()}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

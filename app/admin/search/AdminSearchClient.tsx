'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';
import type { SearchResult } from '@/lib/admin-search';

type SearchResponse = { query: string; results: SearchResult[]; unavailable?: string[] };

export default function AdminSearchClient({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [searched, setSearched] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const run = useCallback(async (term: string) => {
    const trimmed = term.trim();
    if (trimmed.length < 2) { setResults([]); setSearched(''); setMessage(trimmed ? 'Enter at least 2 characters.' : ''); return; }
    setLoading(true);
    setMessage('');
    try {
      const response = await adminFetch(`/api/admin/search?q=${encodeURIComponent(trimmed)}`);
      const data = await parseApiResponse<SearchResponse>(response);
      setResults(data.results || []);
      setUnavailable(data.unavailable || []);
      setSearched(data.query || trimmed);
    } catch (error) {
      setResults([]);
      setMessage(error instanceof Error ? error.message : 'Search failed.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (initialQuery) void run(initialQuery); }, [initialQuery, run]);

  const groups = results.reduce<Array<{ key: string; label: string; items: SearchResult[] }>>((acc, result) => {
    const group = acc.find((entry) => entry.key === result.source);
    if (group) group.items.push(result); else acc.push({ key: result.source, label: result.label, items: [result] });
    return acc;
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Search</h1>
        <p className="mt-1 text-sm text-content-muted">Find news, publications, events, sponsors, teams and gallery albums by title or name. Members and order references appear when your access includes them.</p>
      </div>
      <form
        role="search"
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = query.trim();
          // A new query changes the URL, which remounts this page and searches.
          if (trimmed === initialQuery) void run(trimmed);
          else router.replace(trimmed ? `/admin/search?q=${encodeURIComponent(trimmed)}` : '/admin/search');
        }}
      >
        <label className="flex-1 text-sm font-medium text-content-secondary">Search the CMS
          <input type="search" className="mt-1 block w-full rounded-lg border border-edge-strong bg-surface-card px-3 py-2" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={80} autoFocus />
        </label>
        <Button type="submit" size="sm" isLoading={loading}>Search</Button>
      </form>

      {message && <p className="text-sm" role="status">{message}</p>}
      {unavailable.length > 0 && <p className="text-sm text-content-muted" role="status">Some sections could not be searched just now: {unavailable.join(', ')}.</p>}
      {searched && !loading && results.length === 0 && <p className="text-sm text-content-muted">No matches for &quot;{searched}&quot;.</p>}

      {groups.map((group) => (
        <section key={group.key} className="rounded-xl border bg-surface-card" aria-labelledby={`search-${group.key}`}>
          <h2 id={`search-${group.key}`} className="border-b px-4 py-3 font-display text-lg font-bold">{group.label}</h2>
          <ul className="divide-y">
            {group.items.map((item) => (
              <li key={`${item.source}-${item.id}`} className="px-4 py-3">
                <Link href={item.href} className="font-semibold underline break-words">{item.title}</Link>
                {item.detail && <p className="text-sm text-content-muted break-words">{item.detail}</p>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

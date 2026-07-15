'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Minute = { id: string; title: string; meeting_date: string; status: string };

export default function CommitteeMinutesPage() {
  const [minutes, setMinutes] = useState<Minute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/meeting-minutes', { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load minutes.');
        return r.json();
      })
      .then((d) => setMinutes(d.minutes || []))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load minutes.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <section className="page-hero">
        <div className="container-width">
          <h1 className="page-hero-title">Committee Minutes</h1>
        </div>
      </section>
      <section className="section-padding">
        <div className="container-width space-y-4">
          {loading && (
            <div className="card divide-y divide-edge-subtle" aria-busy="true" aria-live="polite">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-5 animate-pulse space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-2/3 dark:bg-slate-700" />
                  <div className="h-3 bg-gray-200 rounded w-1/3 dark:bg-slate-700" />
                </div>
              ))}
            </div>
          )}
          {error && (
            <p className="text-red-600 font-body text-sm dark:text-red-400">{error}</p>
          )}
          {!loading && !error && minutes.length === 0 && (
            <p className="text-content-muted font-body">No minutes published yet.</p>
          )}
          {!loading && !error && minutes.length > 0 && (
            <div className="card divide-y divide-edge-subtle">
              {minutes.map((m) => (
                <Link key={m.id} href={`/committee/minutes/${m.id}`} className="block p-5 hover:bg-maroon-50/40 transition-colors focus-ring dark:hover:bg-slate-700/50">
                  <p className="font-semibold font-body text-content-primary">{m.title}</p>
                  <p className="text-xs uppercase tracking-[0.06em] text-content-muted font-body mt-1">{m.meeting_date} · <span className="capitalize">{m.status}</span></p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

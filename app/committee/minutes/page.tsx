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
    <div className="container-width py-10 space-y-4">
      <h1 className="text-3xl font-display font-bold">Committee Minutes</h1>
      {loading && (
        <div className="bg-white border rounded-xl divide-y">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-4 animate-pulse space-y-2">
              <div className="h-4 bg-gray-200 rounded w-2/3" />
              <div className="h-3 bg-gray-200 rounded w-1/3" />
            </div>
          ))}
        </div>
      )}
      {error && (
        <p className="text-red-600 font-body text-sm">{error}</p>
      )}
      {!loading && !error && minutes.length === 0 && (
        <p className="text-gray-500 font-body">No minutes published yet.</p>
      )}
      {!loading && !error && minutes.length > 0 && (
        <div className="bg-white border rounded-xl divide-y">
          {minutes.map((m) => (
            <Link key={m.id} href={`/committee/minutes/${m.id}`} className="block p-4 hover:bg-gray-50 transition-colors">
              <p className="font-semibold font-body text-gray-900">{m.title}</p>
              <p className="text-sm text-gray-500 font-body mt-0.5">{m.meeting_date} · <span className="capitalize">{m.status}</span></p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

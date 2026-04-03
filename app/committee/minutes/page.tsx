'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Minute = { id: string; title: string; meeting_date: string; status: string };

export default function CommitteeMinutesPage() {
  const [minutes, setMinutes] = useState<Minute[]>([]);

  useEffect(() => {
    fetch('/api/meeting-minutes', { cache: 'no-store' }).then((r) => r.json()).then((d) => setMinutes(d.minutes || []));
  }, []);

  return (
    <div className="container-width py-10 space-y-4">
      <h1 className="text-3xl font-display font-bold">Committee Minutes</h1>
      <div className="bg-white border rounded-xl divide-y">
        {minutes.map((m) => (
          <Link key={m.id} href={`/committee/minutes/${m.id}`} className="block p-4 hover:bg-gray-50">
            <p className="font-semibold">{m.title}</p>
            <p className="text-sm text-gray-500">{m.meeting_date} · {m.status}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

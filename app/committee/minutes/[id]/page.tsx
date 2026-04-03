'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Button from '@/components/ui/Button';

type Minute = { id: string; title: string; content: string; status: string };

export default function CommitteeMinuteDetailPage() {
  const params = useParams<{ id: string }>();
  const [minute, setMinute] = useState<Minute | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/meeting-minutes', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setMinute((d.minutes || []).find((m: Minute) => m.id === params.id) || null));
  }, [params.id]);

  const act = async (action_type: 'accepted' | 'seconded') => {
    const res = await fetch(`/api/meeting-minutes/${params.id}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_type }),
    });
    setMessage(res.ok ? `Marked as ${action_type}.` : 'Unable to record action.');
  };

  if (!minute) return <div className="container-width py-10">Loading...</div>;

  return (
    <div className="container-width py-10 space-y-4">
      <h1 className="text-3xl font-display font-bold">{minute.title}</h1>
      <p className="text-sm text-gray-500">Status: {minute.status}</p>
      <article className="bg-white border rounded-xl p-5 whitespace-pre-wrap">{minute.content}</article>
      <div className="flex gap-3">
        <Button onClick={() => act('accepted')}>Accept Minutes</Button>
        <Button variant="secondary" onClick={() => act('seconded')}>Second Minutes</Button>
      </div>
      {message && <p className="text-sm text-gray-600">{message}</p>}
    </div>
  );
}

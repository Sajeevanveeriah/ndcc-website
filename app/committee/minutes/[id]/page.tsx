'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';

type Minute = { id: string; title: string; content: string; meeting_date: string; status: string };

export default function CommitteeMinuteDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [minute, setMinute] = useState<Minute | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/meeting-minutes', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const found = (d.minutes || []).find((m: Minute) => m.id === params.id) || null;
        if (!found) setNotFound(true);
        setMinute(found);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [params.id]);

  const act = async (action_type: 'accepted' | 'seconded') => {
    setMessage('');
    const res = await fetch(`/api/meeting-minutes/${params.id}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_type }),
    });
    setMessage(res.ok ? `Marked as ${action_type}.` : 'Unable to record action.');
  };

  if (loading) {
    return (
      <div className="container-width py-10 space-y-4 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/2" />
        <div className="h-4 bg-gray-200 rounded w-1/4" />
        <div className="h-64 bg-gray-100 rounded-xl" />
      </div>
    );
  }

  if (notFound || !minute) {
    return (
      <div className="container-width py-10 space-y-4">
        <p className="text-gray-600 font-body">Minute not found.</p>
        <Button variant="secondary" onClick={() => router.back()}>Go back</Button>
      </div>
    );
  }

  return (
    <div className="container-width py-10 space-y-4">
      <Button variant="ghost" onClick={() => router.back()} className="mb-2">
        ← Back
      </Button>
      <h1 className="text-3xl font-display font-bold">{minute.title}</h1>
      <p className="text-sm text-gray-500 font-body">
        {minute.meeting_date} · <span className="capitalize">{minute.status}</span>
      </p>
      <article className="bg-white border rounded-xl p-5 whitespace-pre-wrap font-body text-gray-800 leading-relaxed">
        {minute.content}
      </article>
      <div className="flex gap-3 flex-wrap">
        <Button onClick={() => act('accepted')}>Accept Minutes</Button>
        <Button variant="secondary" onClick={() => act('seconded')}>Second Minutes</Button>
      </div>
      {message && <p className="text-sm text-gray-600 font-body">{message}</p>}
    </div>
  );
}

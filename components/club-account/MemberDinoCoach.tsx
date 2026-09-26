'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clubAccountJsonFetch } from '@/lib/club-account/browser';

type Summary = { manager: { team_name: string } | null; standing: { rank: number; points: number; managers: number } | null };

// Dino Coach is a separate competition that shares this sign-in. This tab
// only summarises it and links out; Dino Coach keeps its own pages.
export default function MemberDinoCoach() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setSummary(null); setError('');
    clubAccountJsonFetch<Summary>('/api/club-account/dino-coach')
      .then(data => { if (active) setSummary(data); })
      .catch(() => { if (active) setError('Your Dino Coach summary is temporarily unavailable.'); });
    return () => { active = false; };
  }, [retry]);
  return <section aria-labelledby="member-dino-heading" className="space-y-5">
    <div><h2 id="member-dino-heading" className="text-2xl font-bold">Dino Coach</h2><p className="mt-2 text-content-secondary">Dino Coach is the club&apos;s fantasy cricket competition. It uses the same sign-in as your club account.</p></div>
    {error && <p role="alert">{error} <button type="button" className="underline" onClick={() => setRetry(retry + 1)}>Retry Dino Coach summary</button></p>}
    {!summary && !error && <p role="status">Loading your Dino Coach summary...</p>}
    {summary?.manager && <div className="space-y-4 rounded-xl border border-edge-subtle p-5">
      <div><p className="text-sm text-content-secondary">Your team</p><p className="break-words text-xl font-semibold">{summary.manager.team_name}</p></div>
      {summary.standing && <dl className="grid grid-cols-2 gap-3 text-sm sm:max-w-sm"><div><dt className="text-content-secondary">Rank</dt><dd className="text-lg font-semibold">{summary.standing.rank} of {summary.standing.managers}</dd></div><div><dt className="text-content-secondary">Points</dt><dd className="text-lg font-semibold">{summary.standing.points}</dd></div></dl>}
      <Link className="btn-primary inline-block" href="/fantasy/team">Go to my Dino Coach team</Link>
    </div>}
    {summary && !summary.manager && <div className="space-y-3 rounded-xl border border-edge-subtle p-5">
      <p>You have not joined Dino Coach with this sign-in yet.</p>
      <Link className="btn-primary inline-block" href="/fantasy/register">Join Dino Coach</Link>
    </div>}
  </section>;
}

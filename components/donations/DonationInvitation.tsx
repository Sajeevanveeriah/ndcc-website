'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function DonationInvitation() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => fetch('/api/club-settings', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => { if (active) setEnabled(result?.data?.donations_enabled === true); })
      .catch(() => { if (active) setEnabled(false); });
    void refresh();
    window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); };
  }, []);
  if (!enabled) return null;
  return (
    <section className="border-b border-edge-subtle bg-surface-card" aria-labelledby="donate-invitation">
      <div className="container-width py-8 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div className="border-l-4 border-blue-500 pl-5">
          <h2 id="donate-invitation" className="font-display text-2xl font-bold text-content-primary">A little goes a long way.</h2>
          <p className="mt-2 font-body text-content-muted">Support the Dinos with a one-off donation of AUD 10 or more.</p>
        </div>
        <Link href="/sponsors/donate" className="rounded-lg bg-maroon-700 px-6 py-3 text-center font-body font-semibold text-white hover:bg-maroon-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600">Make a donation</Link>
      </div>
    </section>
  );
}

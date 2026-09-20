'use client';

import Link from 'next/link';

export default function PageError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="container-width py-16" role="alert">
      <h1 className="section-title">This page could not load</h1>
      <p className="mb-6 text-content-secondary">The connection was interrupted. Please try again in a moment.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-primary" onClick={reset}>Try again</button>
        <Link href="/" className="btn-secondary">Go to home</Link>
      </div>
    </section>
  );
}

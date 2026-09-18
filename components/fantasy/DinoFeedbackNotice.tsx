'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function DinoFeedbackNotice() {
  const pathname = usePathname();
  if (pathname === '/fantasy/feedback') return null;
  return <aside aria-label="Dino Coach feedback" className="container-width pt-6">
    <div className="rounded-xl border border-edge-subtle bg-surface-elevated px-5 py-4 sm:flex sm:items-center sm:gap-6">
      <div className="flex-1">
        <p className="font-semibold text-content-primary">We&apos;re trying something new</p>
        <p className="mt-1 text-sm leading-relaxed text-content-secondary">This is our first time building something like Dino Coach, so please bear with us as we get it right. If something isn&apos;t working, or you have a suggestion, let us know. We&apos;ll review your feedback and work through what we can improve.</p>
      </div>
      <Link href="/fantasy/feedback" className="btn-secondary mt-3 inline-flex shrink-0 sm:mt-0">Share feedback</Link>
    </div>
  </aside>;
}

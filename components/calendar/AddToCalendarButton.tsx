'use client';

import { useState } from 'react';
import { CalendarPlus, Copy, X } from 'lucide-react';

/**
 * Download link for the public ICS feed so members can import club events into
 * Google/Apple/Outlook calendars.
 */
export default function AddToCalendarButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const httpsUrl = 'https://www.ndcc.com.au/api/public/calendar/feed.ics';
  const webcalUrl = 'webcal://www.ndcc.com.au/api/public/calendar/feed.ics';
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className ?? 'btn-secondary inline-flex items-center gap-2'}>
        <CalendarPlus className="h-4 w-4" aria-hidden="true" /> Subscribe to NDCC Calendar
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-labelledby="calendar-subscribe-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}>
          <div className="w-full max-w-lg rounded-xl border border-edge-subtle bg-surface-card p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <h2 id="calendar-subscribe-title" className="text-xl font-display font-bold text-content-primary">Subscribe to NDCC Calendar</h2>
              <button type="button" autoFocus onClick={() => setOpen(false)} aria-label="Close calendar subscription" className="rounded p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon-500"><X className="h-5 w-5" /></button>
            </div>
            <p className="mt-3 text-sm text-content-secondary">Subscribe once and future NDCC calendar updates will appear automatically in your calendar.</p>
            <div className="mt-5 flex flex-col gap-3">
              <a className="btn-primary inline-flex justify-center" href={webcalUrl}>Apple Calendar / compatible app</a>
              <button type="button" className="btn-secondary inline-flex items-center justify-center gap-2" onClick={async () => { await navigator.clipboard.writeText(httpsUrl); setCopied(true); }}><Copy className="h-4 w-4" />{copied ? 'Subscription URL copied' : 'Copy subscription URL'}</button>
            </div>
            <div className="mt-5 space-y-3 text-sm text-content-secondary">
              <p><strong>Google Calendar:</strong> Settings - Add calendar - From URL, then paste the copied URL.</p>
              <p><strong>Outlook:</strong> Add calendar - Subscribe from web, then paste the copied URL.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

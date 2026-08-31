'use client';

import { useState } from 'react';
import { CalendarPlus, Copy, Download, ExternalLink } from 'lucide-react';

const HTTPS_URL = 'https://www.ndcc.com.au/committee-calendar.ics';
const WEBCAL_URL = 'webcal://www.ndcc.com.au/committee-calendar.ics';
const GOOGLE_ADD_BY_URL = 'https://calendar.google.com/calendar/u/0/r/settings/addbyurl';

export default function CommitteeCalendarSubscribe() {
  const [copyStatus, setCopyStatus] = useState('');

  async function copySubscriptionUrl() {
    try {
      await navigator.clipboard.writeText(HTTPS_URL);
      setCopyStatus('Calendar link copied.');
    } catch {
      setCopyStatus(`Copy this calendar link: ${HTTPS_URL}`);
    }
  }

  return (
    <div className="rounded-xl border border-edge-subtle bg-surface-card p-5 shadow-soft sm:p-6">
      <div className="flex items-start gap-3">
        <CalendarPlus className="mt-1 h-6 w-6 shrink-0 text-maroon-700 dark:text-maroon-200" aria-hidden="true" />
        <div>
          <h2 className="font-display text-2xl font-bold text-content-primary">Subscribe once</h2>
          <p className="mt-1 font-body text-content-secondary">
            Future committee calendar changes will appear automatically. No NDCC website account is required.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <a href={WEBCAL_URL} className="btn-primary inline-flex min-h-12 items-center justify-center gap-2 text-center">
          <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          Subscribe on this device
        </a>

        <button
          type="button"
          onClick={copySubscriptionUrl}
          className="btn-secondary inline-flex min-h-12 items-center justify-center gap-2"
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
          Copy subscription link
        </button>

        <a
          href={GOOGLE_ADD_BY_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => void copySubscriptionUrl()}
          className="btn-secondary inline-flex min-h-12 items-center justify-center gap-2 text-center"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Google Calendar
        </a>

        <a
          href={`${HTTPS_URL}?download=1`}
          className="btn-secondary inline-flex min-h-12 items-center justify-center gap-2 text-center"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Download current events
        </a>
      </div>

      <p className="mt-4 min-h-6 text-sm font-body text-content-secondary" aria-live="polite">
        {copyStatus}
      </p>

      <div className="mt-2 space-y-3 border-t border-edge-subtle pt-5 text-sm font-body text-content-secondary">
        <p>
          <strong className="text-content-primary">Apple Calendar, Outlook and compatible calendar apps:</strong>{' '}
          press <strong>Subscribe on this device</strong> and accept the subscription prompt.
        </p>
        <p>
          <strong className="text-content-primary">Google Calendar:</strong> press <strong>Google Calendar</strong>. The
          subscription link is copied for you. Paste it into Google&apos;s <strong>URL of calendar</strong> field and press
          <strong> Add calendar</strong>. Google requires a Google account to use Google Calendar.
        </p>
        <p>
          <strong className="text-content-primary">Last resort:</strong> <strong>Download current events</strong> imports a
          snapshot, but it will not receive later updates automatically.
        </p>
      </div>
    </div>
  );
}

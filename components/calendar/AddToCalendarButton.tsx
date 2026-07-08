import { CalendarPlus } from 'lucide-react';

/**
 * Download link for the public ICS feed so members can import club events into
 * Google/Apple/Outlook calendars.
 */
export default function AddToCalendarButton({ className }: { className?: string }) {
  return (
    <a href="/api/public/calendar/ics" className={className ?? 'btn-secondary inline-flex items-center gap-2'} download>
      <CalendarPlus className="h-4 w-4" aria-hidden="true" />
      Download calendar (.ics)
    </a>
  );
}

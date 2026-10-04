/**
 * Events loading skeleton: the maroon inner hero plus a card grid, matching
 * the events list layout so a slow Supabase response shows the page shape
 * instead of a blank page. Also covers /events/[id] while it loads.
 */
export default function EventsLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading events</span>
      <div className="page-hero px-0 sm:px-0 lg:px-0" aria-hidden="true">
        <div className="nd-wrap animate-pulse space-y-4">
          <div className="h-4 w-32 rounded-sm bg-white/25" />
          <div className="h-12 w-64 max-w-full rounded-lg bg-white/25" />
          <div className="h-5 w-lg max-w-full rounded-sm bg-white/20" />
        </div>
      </div>
      <div className="nd-sec-tight" aria-hidden="true">
        <div className="nd-wrap animate-pulse">
          <div className="mb-3.5 h-4 w-32 rounded-sm bg-surface-muted" />
          <div className="nd-ev-grid">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="nd-card nd-ev-card">
                <div className="nd-ev-img" />
                <div className="nd-ev-body">
                  <div className="h-5 w-20 rounded-full bg-surface-muted" />
                  <div className="h-6 w-2/3 rounded-sm bg-surface-muted" />
                  <div className="h-4 w-full rounded-sm bg-surface-muted" />
                  <div className="h-4 w-5/6 rounded-sm bg-surface-muted" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

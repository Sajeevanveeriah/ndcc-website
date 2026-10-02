// Route skeleton shaped like the teams page: maroon hero, segmented filter
// and a grid of team cards.
export default function TeamsLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading teams</span>
      <div className="page-hero px-0 sm:px-0 lg:px-0">
        <div className="nd-wrap animate-pulse space-y-4">
          <div className="h-4 w-28 rounded bg-white/20" />
          <div className="h-12 w-60 max-w-full rounded-lg bg-white/20" />
          <div className="h-5 w-96 max-w-full rounded bg-white/20" />
        </div>
      </div>
      <div className="nd-sec-tight">
        <div className="nd-wrap animate-pulse">
          <div className="mb-[22px] h-12 w-full max-w-sm rounded-full bg-surface-muted" />
          <div className="mb-3.5 h-4 w-28 rounded bg-surface-muted" />
          <div className="nd-ev-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="nd-card space-y-3 p-5">
                <div className="h-5 w-24 rounded-full bg-surface-muted" />
                <div className="h-6 w-2/3 rounded bg-surface-muted" />
                <div className="h-4 w-full rounded bg-surface-muted" />
                <div className="h-4 w-1/2 rounded bg-surface-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

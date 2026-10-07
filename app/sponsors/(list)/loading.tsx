// Route skeleton shaped like the sponsors page: maroon hero, logo tile grid
// and the two-column "Become a sponsor" section.
export default function SponsorsLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading sponsors</span>
      <div className="page-hero px-0 sm:px-0 lg:px-0">
        <div className="nd-wrap animate-pulse space-y-4">
          <div className="h-4 w-32 rounded-sm bg-white/20" />
          <div className="h-12 w-72 max-w-full rounded-lg bg-white/20" />
          <div className="h-5 w-96 max-w-full rounded-sm bg-white/20" />
        </div>
      </div>
      <div className="nd-sec-tight">
        <div className="nd-wrap animate-pulse">
          <div className="mb-8 space-y-3">
            <div className="h-8 w-64 max-w-full rounded-lg bg-surface-muted" />
            <div className="h-5 w-full max-w-2xl rounded-sm bg-surface-muted" />
          </div>
          <div className="nd-logos">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="nd-logo-tile bg-surface-muted" />
            ))}
          </div>
        </div>
      </div>
      <div className="nd-sec-tight">
        <div className="nd-wrap nd-two-col animate-pulse">
          <div className="space-y-3">
            <div className="h-4 w-40 rounded-sm bg-surface-muted" />
            <div className="h-9 w-64 max-w-full rounded-lg bg-surface-muted" />
            <div className="h-48 rounded-[22px] bg-surface-muted" />
          </div>
          <div className="h-96 rounded-[22px] bg-surface-muted" />
        </div>
      </div>
    </div>
  );
}

/**
 * Shared route-level loading skeleton. Every top-level route's loading.tsx
 * re-exports this so a slow Supabase response shows structure immediately
 * instead of a blank page.
 */
export default function RouteSkeleton() {
  return (
    <div className="section-padding" aria-busy="true" aria-live="polite">
      <div className="container-width animate-pulse space-y-8">
        <div className="space-y-3">
          <div className="h-10 w-72 max-w-full rounded-lg bg-gray-200 dark:bg-slate-700" />
          <div className="h-5 w-96 max-w-full rounded bg-gray-200 dark:bg-slate-700" />
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-6">
              <div className="mb-4 h-36 rounded-lg bg-gray-200 dark:bg-slate-700" />
              <div className="mb-2 h-5 w-2/3 rounded bg-gray-200 dark:bg-slate-700" />
              <div className="h-4 w-full rounded bg-gray-200 dark:bg-slate-700" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

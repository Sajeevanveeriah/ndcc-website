// Loading skeleton shaped like the contact page: maroon hero, then the
// enquiry form card beside the club details card.
const bar = 'rounded-sm bg-gray-200 dark:bg-slate-700';

export default function ContactLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="page-hero px-0">
        <div className="nd-wrap animate-pulse space-y-4">
          <div className="h-4 w-28 rounded-sm bg-white/20" />
          <div className="h-12 w-64 max-w-full rounded-lg bg-white/20" />
          <div className="h-5 w-96 max-w-full rounded-sm bg-white/20" />
        </div>
      </div>
      <div className="nd-sec-tight">
        <div className="nd-wrap nd-two-col animate-pulse">
          <div className="nd-card space-y-4 p-5 sm:p-[26px]">
            <div className={`h-7 w-56 max-w-full ${bar}`} />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={`h-12 w-full rounded-xl ${bar}`} />
            ))}
            <div className={`h-28 w-full rounded-xl ${bar}`} />
            <div className={`h-12 w-full rounded-full ${bar}`} />
          </div>
          <div className="nd-card space-y-5 p-5 sm:p-[26px]">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className={`h-3 w-16 ${bar}`} />
                <div className={`h-5 w-3/4 ${bar}`} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Loading skeleton shaped like the join page: maroon hero, three membership
// choice cards, then the application form beside the fees card.
const bar = 'rounded bg-gray-200 dark:bg-slate-700';

export default function JoinLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="page-hero px-0">
        <div className="nd-wrap animate-pulse space-y-4">
          <div className="h-4 w-24 rounded bg-white/20" />
          <div className="h-12 w-72 max-w-full rounded-lg bg-white/20" />
          <div className="h-5 w-96 max-w-full rounded bg-white/20" />
        </div>
      </div>
      <div className="nd-sec-tight">
        <div className="nd-wrap animate-pulse space-y-7">
          <div className={`h-8 w-64 max-w-full ${bar}`} />
          <div className="nd-radio-cards">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="nd-card space-y-3 p-[22px]">
                <div className={`h-5 w-28 rounded-full ${bar}`} />
                <div className={`h-6 w-2/3 ${bar}`} />
                <div className={`h-4 w-full ${bar}`} />
                <div className={`h-4 w-5/6 ${bar}`} />
              </div>
            ))}
          </div>
          <div className="nd-two-col">
            <div className="nd-card space-y-4 p-5 sm:p-[26px]">
              <div className={`h-7 w-48 ${bar}`} />
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={`h-12 w-full rounded-xl ${bar}`} />
              ))}
            </div>
            <div className="nd-card space-y-3 p-5 sm:p-[26px]">
              <div className={`h-6 w-24 ${bar}`} />
              <div className={`h-4 w-full ${bar}`} />
              <div className={`h-4 w-4/5 ${bar}`} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

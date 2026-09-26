import { safeReturnPath } from '@/lib/preview';

/** Shown only in draft mode, above a record rendered for committee preview. */
export default function PreviewBanner({ label, returnPath }: { label: string; returnPath: string }) {
  const exitHref = `/api/admin/preview?exit=1&to=${encodeURIComponent(safeReturnPath(returnPath))}`;
  return (
    <div role="status" className="border-b-2 border-[#162845] bg-[#edc266] px-4 py-3 text-[#162845]">
      <div className="container-width flex flex-wrap items-center justify-between gap-2">
        <p className="font-body text-sm font-bold">{label}</p>
        {/* Plain anchor: the exit route clears the draft cookie and redirects. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href={exitHref} className="font-body text-sm font-semibold underline underline-offset-4">Exit preview</a>
      </div>
    </div>
  );
}

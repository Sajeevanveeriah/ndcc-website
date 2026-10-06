/**
 * Loading placeholder for admin list pages: a card with pulsing bars.
 * Uses theme tokens so the bars stay visible on dark surfaces.
 */
export default function AdminSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="bg-surface-card rounded-xl border border-edge-subtle p-8 animate-pulse">
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className={i === lines - 1 ? 'h-4 bg-edge-subtle rounded-sm w-3/4' : 'h-4 bg-edge-subtle rounded-sm w-full mb-4'}
        />
      ))}
    </div>
  );
}

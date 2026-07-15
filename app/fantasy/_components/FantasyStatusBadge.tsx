import { cn } from '@/lib/utils';
import type { FantasyModuleStatus } from '@/lib/fantasy';

const statusLabels: Record<FantasyModuleStatus, string> = {
  available: 'Open',
  planned: 'Foundation ready',
};

export default function FantasyStatusBadge({ status }: { status: FantasyModuleStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-body font-semibold uppercase tracking-wide',
        status === 'available'
          ? 'bg-maroon-100 dark:bg-maroon-950 text-maroon-800 dark:text-maroon-200'
          : 'bg-surface-blue-card text-content-blue'
      )}
    >
      {statusLabels[status]}
    </span>
  );
}

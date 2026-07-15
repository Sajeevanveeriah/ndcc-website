import { cn } from '@/lib/utils';

interface TableProps {
  className?: string;
  children: React.ReactNode;
}

export function Table({ className, children }: TableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-edge-subtle">
      <table className={cn('min-w-full divide-y divide-edge-subtle', className)}>{children}</table>
    </div>
  );
}

export function TableHead({ className, children }: TableProps) {
  // Maroon-tinted "scorebook ledger" header rather than a generic grey grid.
  return <thead className={cn('bg-maroon-50/60 dark:bg-surface-muted', className)}>{children}</thead>;
}

export function TableBody({ className, children }: TableProps) {
  return <tbody className={cn('divide-y divide-edge-subtle bg-surface-card', className)}>{children}</tbody>;
}

export function TableRow({ className, children }: TableProps) {
  return <tr className={cn('hover:bg-surface-blue-subtle/60 transition-colors', className)}>{children}</tr>;
}

export function TableHeader({ className, children }: TableProps) {
  return (
    <th
      className={cn(
        'px-4 py-3 text-left text-xs font-semibold text-maroon-800 uppercase tracking-wider font-body dark:text-maroon-200',
        className
      )}
    >
      {children}
    </th>
  );
}

export function TableCell({ className, children }: TableProps) {
  return <td className={cn('px-4 py-3 text-sm text-content-secondary font-body', className)}>{children}</td>;
}

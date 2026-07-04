import { cn } from '@/lib/utils';

interface TableProps {
  className?: string;
  children: React.ReactNode;
}

export function Table({ className, children }: TableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className={cn('min-w-full divide-y divide-gray-200', className)}>{children}</table>
    </div>
  );
}

export function TableHead({ className, children }: TableProps) {
  return <thead className={cn('bg-gray-50', className)}>{children}</thead>;
}

export function TableBody({ className, children }: TableProps) {
  return <tbody className={cn('divide-y divide-gray-200 bg-white', className)}>{children}</tbody>;
}

export function TableRow({ className, children }: TableProps) {
  // Explicit dark variant: the dark compatibility layer in globals.css only
  // remaps `bg-*` classes, so a bare hover:bg-* would flash light rows on
  // dark surfaces.
  return <tr className={cn('hover:bg-sky-50/70 dark:hover:bg-slate-700/60 transition-colors', className)}>{children}</tr>;
}

export function TableHeader({ className, children }: TableProps) {
  return (
    <th
      className={cn(
        'px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider font-body',
        className
      )}
    >
      {children}
    </th>
  );
}

export function TableCell({ className, children }: TableProps) {
  return <td className={cn('px-4 py-3 text-sm text-gray-700 font-body', className)}>{children}</td>;
}

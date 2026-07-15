import { cn } from '@/lib/utils';

interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  children: React.ReactNode;
  className?: string;
}

export default function Badge({ variant = 'default', children, className }: BadgeProps) {
  const variants = {
    default: 'bg-maroon-100 dark:bg-maroon-950 text-maroon-800 dark:text-maroon-200 ring-maroon-200/60 dark:ring-maroon-800/60',
    success: 'bg-green-100 text-green-800 ring-green-200/60 dark:bg-green-900/40 dark:text-green-300 dark:ring-green-800/60',
    warning: 'bg-yellow-100 text-yellow-800 ring-yellow-200/60 dark:bg-yellow-900/40 dark:text-yellow-300 dark:ring-yellow-800/60',
    danger: 'bg-red-100 text-red-800 ring-red-200/60 dark:bg-red-900/40 dark:text-red-300 dark:ring-red-800/60',
    info: 'bg-blue-100 text-blue-800 ring-blue-200/60 dark:bg-blue-900/40 dark:text-blue-300 dark:ring-blue-800/60',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold font-body ring-1 ring-inset',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

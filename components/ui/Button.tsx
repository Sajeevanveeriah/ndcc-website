'use client';

import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  children: React.ReactNode;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles =
    'inline-flex items-center justify-center font-body font-semibold rounded-[10px] transition-all duration-200 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 dark:focus:ring-offset-slate-900';

  const variants = {
    primary:
      'bg-maroon-700 text-white shadow-sm hover:bg-maroon-800 hover:shadow-md focus:ring-maroon-500 dark:hover:bg-maroon-500',
    secondary:
      'border-2 border-maroon-700 text-maroon-700 hover:bg-maroon-700 hover:text-white hover:shadow-md focus:ring-maroon-500 dark:border-maroon-300/70 dark:text-maroon-100 dark:bg-maroon-950/30 dark:hover:bg-maroon-700 dark:hover:border-maroon-600 dark:hover:text-white',
    accent:
      'bg-sky_accent text-maroon-900 dark:text-maroon-900 shadow-sm border border-sky-300/60 dark:border-sky-200/40 hover:bg-sky-300 hover:shadow-md focus:ring-sky-400',
    ghost:
      'text-maroon-700 hover:bg-maroon-50 focus:ring-maroon-500 dark:text-maroon-200 dark:hover:bg-maroon-950/60',
    danger: 'bg-red-700 text-white hover:bg-red-800 focus:ring-red-500 dark:bg-red-600 dark:hover:bg-red-500',
  };

  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
  };

  return (
    <button
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

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
    'inline-flex items-center justify-center gap-2 font-body font-semibold tracking-[-0.01em] rounded-full transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out active:translate-y-px focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed dark:focus:ring-offset-slate-900';

  const variants = {
    primary:
      'bg-maroon-700 text-white shadow-sm hover:bg-maroon-800 focus:ring-maroon-500 dark:hover:bg-maroon-500',
    secondary:
      'border border-edge-strong bg-surface-card text-content-primary hover:border-maroon-700 hover:text-maroon-700 focus:ring-maroon-500 dark:bg-transparent dark:text-maroon-100 dark:hover:border-maroon-300 dark:hover:text-white',
    accent:
      'bg-sky_accent text-maroon-900 dark:text-maroon-900 shadow-sm border border-sky_accent hover:bg-sky_accent-light hover:border-sky_accent-light focus:ring-navy',
    ghost:
      'text-maroon-700 hover:bg-maroon-50 focus:ring-maroon-500 dark:text-maroon-200 dark:hover:bg-maroon-950/60',
    danger: 'bg-red-700 text-white hover:bg-red-800 focus:ring-red-500 dark:bg-red-600 dark:hover:bg-red-500',
  };

  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'min-h-11 px-6 py-2.5 text-base',
    lg: 'min-h-12 px-8 py-3 text-lg',
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

'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

const OPTIONS = [
  { value: 'light', label: 'Light theme', Icon: Sun },
  { value: 'dark', label: 'Dark theme', Icon: Moon },
  { value: 'system', label: 'Match system theme', Icon: Monitor },
] as const;

export default function ThemeToggle({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Header variant: one round button that switches between light and dark
  // (the mobile menu keeps the three-way control, including "match system").
  if (compact) {
    if (!mounted) return <div className={cn('h-10 w-10', className)} aria-hidden />;
    const dark = resolvedTheme === 'dark';
    const label = dark ? 'Switch to light theme' : 'Switch to dark theme';
    const Icon = dark ? Sun : Moon;
    return (
      <button
        type="button"
        onClick={() => setTheme(dark ? 'light' : 'dark')}
        aria-label={label}
        title={label}
        className={cn('inline-flex h-11 w-11 items-center justify-center rounded-full border border-edge-subtle bg-surface-card text-content-primary transition-colors duration-200 hover:bg-surface-muted focus-ring', className)}
      >
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>
    );
  }

  // The active theme is unknown until the client mounts; render a same-size
  // placeholder so the navbar does not shift when the control appears.
  if (!mounted) {
    return <div className={cn('h-[50px] w-[142px]', className)} aria-hidden />;
  }

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className={cn(
        'flex items-center gap-0.5 rounded-full border border-edge-subtle bg-surface-muted/60 p-0.5',
        className
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          aria-label={label}
          aria-pressed={theme === value}
          title={label}
          className={cn(
            'inline-flex h-11 w-11 items-center justify-center rounded-full transition-[background-color,color,box-shadow] duration-200 focus-ring',
            theme === value
              ? 'bg-surface-card text-maroon-700 shadow-[0_1px_3px_rgba(29,29,31,0.14)] dark:bg-white/10 dark:text-white'
              : 'text-content-muted hover:text-content-primary dark:text-slate-400 dark:hover:text-white'
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

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

export default function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // The active theme is unknown until the client mounts; render a same-size
  // placeholder so the navbar does not shift when the control appears.
  if (!mounted) {
    return <div className={cn('h-9 w-[6.75rem]', className)} aria-hidden />;
  }

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className={cn(
        'flex items-center gap-0.5 rounded-lg border border-edge-subtle bg-surface-card p-0.5 dark:border-slate-700 dark:bg-slate-800',
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
            'p-1.5 rounded-md transition-colors focus-ring',
            theme === value
              ? 'bg-maroon-700 text-white'
              : 'text-content-muted hover:text-maroon-700 hover:bg-maroon-50 dark:text-slate-400 dark:hover:text-maroon-200 dark:hover:bg-slate-700'
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

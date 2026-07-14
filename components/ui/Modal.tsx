'use client';

import { useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export default function Modal({ isOpen, onClose, title, children, className, size = 'md' }: ModalProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="fixed inset-0 bg-maroon-950/60 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={cn(
          'relative bg-surface-elevated rounded-2xl shadow-2xl ring-1 ring-black/5 w-full max-h-[90vh] overflow-y-auto dark:ring-edge-subtle',
          sizes[size],
          className
        )}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-edge-subtle">
            <h2 className="text-xl font-display font-bold uppercase tracking-wide text-maroon-800 dark:text-maroon-100">{title}</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-surface-muted transition-colors focus-ring"
              aria-label="Close"
            >
              <X className="h-5 w-5 text-gray-500 dark:text-slate-400" />
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

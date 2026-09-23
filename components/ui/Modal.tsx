'use client';

import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ModalBaseProps = {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
};

// A dialog needs an accessible name: either a visible title (referenced via
// aria-labelledby) or, when there is no title, an explicit aria-label.
type ModalProps = ModalBaseProps &
  (
    | { title: string; ariaLabel?: string }
    | { title?: undefined; ariaLabel: string }
  );

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true' && el.getClientRects().length > 0,
  );
}

export default function Modal({ isOpen, onClose, title, ariaLabel, children, className, size = 'md' }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  // Keep the latest onClose without re-running the open/close effect (callers
  // often pass inline arrow functions, which would otherwise steal focus back
  // to the dialog on every parent render).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    // Remember the opener (usually the button that was clicked) so focus can
    // return to it on close.
    const opener = (document.activeElement ?? null) as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move focus into the dialog: first focusable control, else the dialog itself.
    if (dialog && !dialog.contains(document.activeElement)) {
      const [first] = getFocusable(dialog);
      (first ?? dialog).focus({ preventScroll: true });
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const focusable = getFocusable(dialog);
      if (focusable.length === 0) {
        e.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || active === dialog || !dialog.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialog.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      // Return focus to whatever opened the dialog, if it is still on the page.
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  const hasTitle = Boolean(title);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop: pointer-only dismissal. Keyboard users close with Escape or
          the Close button, so this needs no role or tab stop. */}
      <div className="fixed inset-0 bg-maroon-950/60 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={hasTitle ? titleId : undefined}
        aria-label={hasTitle ? undefined : ariaLabel || 'Dialog'}
        tabIndex={-1}
        className={cn(
          'relative bg-surface-elevated rounded-2xl shadow-2xl ring-1 ring-black/5 w-full max-h-[90vh] overflow-y-auto focus:outline-none dark:ring-edge-subtle',
          sizes[size],
          className
        )}
      >
        {hasTitle && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-edge-subtle">
            <h2 id={titleId} className="text-xl font-display font-bold uppercase tracking-wide text-maroon-800 dark:text-maroon-100">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-surface-muted transition-colors focus-ring"
              aria-label="Close"
            >
              <X className="h-5 w-5 text-content-muted dark:text-slate-400" aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

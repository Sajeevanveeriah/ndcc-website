'use client';
import { useEffect, useState } from 'react';
import { COOKIE_DOUGH_ENDS_AT, isCookieDoughOpen } from '@/lib/cookie-dough';

/** `endsAt` null keeps the content visible; omitted uses the hardcoded deadline. */
export function useCookieDoughOpen(initialOpen = true, endsAt: number | null = COOKIE_DOUGH_ENDS_AT) {
  const [open, setOpen] = useState(initialOpen);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      setOpen(isCookieDoughOpen(Date.now(), endsAt));
      if (endsAt === null) return;
      const remaining = endsAt - Date.now();
      // Cap long waits to avoid the browser's signed 32-bit timeout overflow.
      if (remaining > 0) timer = setTimeout(refresh, Math.min(remaining, 86_400_000));
    };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [endsAt]);
  return open;
}

export default function CookieDoughVisibility({ children, initialOpen, endsAt }: { children: React.ReactNode; initialOpen: boolean; endsAt?: number | null }) {
  return useCookieDoughOpen(initialOpen, endsAt === undefined ? COOKIE_DOUGH_ENDS_AT : endsAt) ? <>{children}</> : null;
}

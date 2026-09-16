'use client';
import { useEffect, useState } from 'react';
import { COOKIE_DOUGH_ENDS_AT, isCookieDoughOpen } from '@/lib/cookie-dough';

export function useCookieDoughOpen(initialOpen = true) {
  const [open, setOpen] = useState(initialOpen);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      setOpen(isCookieDoughOpen());
      const remaining = COOKIE_DOUGH_ENDS_AT - Date.now();
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
  }, []);
  return open;
}

export default function CookieDoughVisibility({ children, initialOpen }: { children: React.ReactNode; initialOpen: boolean }) {
  return useCookieDoughOpen(initialOpen) ? <>{children}</> : null;
}

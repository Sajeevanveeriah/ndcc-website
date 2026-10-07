'use client';

// Cloudflare Turnstile bot check for public forms.
//
// Renders nothing unless NEXT_PUBLIC_TURNSTILE_SITE_KEY is set, so forms behave
// exactly as before until the club configures Turnstile. The server
// (lib/server/turnstile.ts) only enforces when TURNSTILE_SECRET_KEY is set and
// TURNSTILE_ENFORCE=true, so the widget can be switched on (site key) before
// enforcement. Tokens are single use: call reset() after every submission
// attempt, successful or not.

import { useCallback, useEffect, useId, useRef, useState } from 'react';

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window { turnstile?: TurnstileApi }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not load')));
    script.onerror = () => { scriptPromise = null; reject(new Error('Turnstile could not load')); };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function turnstileSiteKey(): string {
  return (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '').trim();
}

/**
 * State for one form's bot check. `required` is false when no site key is
 * configured; then `token` stays null and forms submit as before.
 */
export const TURNSTILE_MISSING_MESSAGE = 'Please complete the security check above.';

export function useTurnstile() {
  const required = Boolean(turnstileSiteKey());
  const [token, setTokenState] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [message, setMessage] = useState('');
  const setToken = useCallback((value: string | null) => { setTokenState(value); if (value) setMessage(''); }, []);
  const reset = useCallback(() => { setTokenState(null); setResetKey((value) => value + 1); }, []);
  const ready = !required || Boolean(token);
  // Call before sending to a protected route: false (and an inline message on
  // the widget) when the check is required but not yet complete.
  const check = useCallback(() => {
    if (ready) return true;
    setMessage(TURNSTILE_MISSING_MESSAGE);
    return false;
  }, [ready]);
  return { required, token, setToken, reset, resetKey, ready, check, message };
}

export default function TurnstileWidget({ onToken, resetKey = 0, action, className, message }: {
  onToken: (token: string | null) => void;
  resetKey?: number;
  /** Inline message under the widget, e.g. useTurnstile().message. */
  message?: string;
  /** Shown in the Cloudflare dashboard analytics (letters, digits, - and _ only). */
  action?: string;
  className?: string;
}) {
  const siteKey = turnstileSiteKey();
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const callback = useRef(onToken);
  callback.current = onToken;
  const id = useId();
  const [problem, setProblem] = useState('');

  useEffect(() => {
    if (!siteKey || !container.current) return;
    let cancelled = false;
    loadTurnstile().then((api) => {
      if (cancelled || !container.current) return;
      widgetId.current = api.render(container.current, {
        sitekey: siteKey,
        action,
        theme: 'auto',
        size: 'flexible',
        callback: (value: string) => { setProblem(''); callback.current(value); },
        'expired-callback': () => callback.current(null),
        'timeout-callback': () => callback.current(null),
        'error-callback': () => { callback.current(null); setProblem('The security check could not load. Refresh the page and try again.'); },
      });
    }).catch(() => { if (!cancelled) setProblem('The security check could not load. Check your connection, then refresh the page.'); });
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, action]);

  // A new resetKey asks Cloudflare for a fresh token (tokens are single use).
  useEffect(() => {
    if (resetKey && widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
  }, [resetKey]);

  if (!siteKey) return null;
  return <div className={className}>
    <div ref={container} aria-describedby={problem ? `${id}-problem` : undefined} />
    {problem && <p id={`${id}-problem`} role="alert" className="mt-2 text-sm text-status-error">{problem}</p>}
    {message && !problem && <p role="alert" className="mt-2 text-sm text-status-error">{message}</p>}
  </div>;
}

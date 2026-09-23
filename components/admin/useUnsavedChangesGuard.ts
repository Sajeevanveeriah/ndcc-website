'use client';

import { useEffect } from 'react';

/**
 * Warns before the tab is closed, reloaded or navigated away from while an
 * admin editor has unsaved changes. Browsers show their own generic prompt;
 * the message text is not customisable.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Required by some browsers to trigger the prompt.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
}

export default useUnsavedChangesGuard;

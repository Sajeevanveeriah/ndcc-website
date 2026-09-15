'use client';

import { useEffect } from 'react';
import { authEmailReturnPath } from '@/lib/auth/email-return';

export default function AuthEmailRedirect() {
  useEffect(() => {
    const destination = authEmailReturnPath(window.location.pathname, window.location.hash);
    if (destination) window.location.replace(destination + window.location.hash);
  }, []);
  return null;
}

// Supabase falls back to its configured site root when a redirect is not
// allowlisted. Keep credentials in the fragment and use fixed local targets.
export function authEmailReturnPath(pathname: string, hash: string): string | null {
  if (pathname !== '/') return null;
  const values = new URLSearchParams(hash.replace(/^#/, ''));
  if (!values.get('access_token') || !values.get('refresh_token')) return null;
  const type = values.get('type');
  if (type === 'recovery') return '/club-account/reset-password';
  if (type === 'signup' || type === 'magiclink' || type === 'email_change') return '/club-account';
  return null;
}

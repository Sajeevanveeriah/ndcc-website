export const DEFAULT_AUTH_CALLBACK_PATH = '/fantasy/account';

function isLocalRedirectPath(value: string) {
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\');
}

/**
 * Resolve an auth callback destination without allowing the `next` parameter
 * to escape the request origin. Query parameters from the auth provider are
 * retained for the destination page to process.
 */
export function resolveAuthCallbackRedirect(requestUrl: URL) {
  const next = requestUrl.searchParams.get('next');
  let redirectUrl = new URL(DEFAULT_AUTH_CALLBACK_PATH, requestUrl.origin);

  if (next && isLocalRedirectPath(next)) {
    try {
      const candidate = new URL(next, requestUrl.origin);
      if (candidate.origin === requestUrl.origin) redirectUrl = candidate;
    } catch {
      // Keep the safe default when `next` is not a valid URL path.
    }
  }

  requestUrl.searchParams.forEach((value, key) => {
    if (key !== 'next') redirectUrl.searchParams.set(key, value);
  });

  return redirectUrl;
}

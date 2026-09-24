/** Bounded admin requests; only reads may be replayed after a transient failure. */
export async function adminFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener('abort', abort, { once: true });
  const headers = new Headers(options.headers);
  const method = (options.method || 'GET').toUpperCase();
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method) && !headers.has('X-NDCC-CSRF')) {
    headers.set('X-NDCC-CSRF', '1');
  }
  try {
    const request = () => fetch(url, { cache: 'no-store', credentials: 'include', ...options, headers, signal: controller.signal });
    const isRead = ['GET', 'HEAD'].includes(method);
    let retried = false;
    let response: Response;
    try {
      response = await request();
    } catch (error) {
      if (!isRead || controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
      retried = true;
      response = await request();
    }
    if (isRead && !retried && [502, 503, 504].includes(response.status)) {
      await response.body?.cancel();
      response = await request();
    }
    // Older endpoints return 403 for both a refused permission and a failed
    // session lookup. Resolve that ambiguity without replaying a mutation.
    if (response.status === 403 && url.startsWith('/api/admin/') && !url.startsWith('/api/admin/auth/')) {
      const session = await fetch('/api/admin/auth/session', { cache: 'no-store', credentials: 'include', signal: controller.signal });
      if (session.status === 503) throw new Error('Session validation is temporarily unavailable. Please retry.');
      if (session.status === 401) throw new Error('Your session has expired. Please sign in again.');
      if (session.ok && ['GET', 'HEAD'].includes(method) && (await session.json()).authenticated === true) {
        await response.body?.cancel();
        response = await request();
      }
    }
    return response;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Request timed out. Please check your connection and try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    options.signal?.removeEventListener('abort', abort);
  }
}

export async function parseApiResponse<T>(response: Response): Promise<T> {
  let body: Record<string, unknown> | null = null;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message = typeof body?.error === 'string' ? body.error : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return (body ?? {}) as T;
}

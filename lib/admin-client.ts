/** fetch() wrapper with a 30-second abort timeout so admin modals never hang indefinitely. */
export async function adminFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
  const headers = new Headers(options.headers);
  const method = (options.method || 'GET').toUpperCase();
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method) && !headers.has('X-NDCC-CSRF')) {
    headers.set('X-NDCC-CSRF', '1');
  }
  try {
    return await fetch(url, { cache: 'no-store', credentials: 'include', ...options, headers, signal: controller.signal });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Request timed out. Please check your connection and try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
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

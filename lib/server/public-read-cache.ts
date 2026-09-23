/**
 * Shared in-process guard for public CMS reads (no imports: tested directly
 * with --experimental-strip-types).
 *
 * The production database sits behind a 10-connection PostgREST pool. When a
 * crawler or a deploy regenerates many ISR pages at once, every render fires
 * the same handful of reads (club settings, footer links, content blocks...)
 * and the pool queues them for tens of seconds, so renders time out and fall
 * back or fail. This wrapper, used only for public read helpers:
 *
 * - coalesces identical in-flight GET requests into one upstream request;
 * - reuses a successful response for FRESH_MS, so a burst of renders on one
 *   instance shares a single read while admin edits still appear within
 *   seconds (well inside the pages' 60 s ISR window);
 * - when the upstream read fails or times out, serves the last successful
 *   response (up to STALE_MS old) instead of fallback content or an error.
 *
 * Failures and non-2xx responses are never stored. Writes pass straight through.
 */

export const PUBLIC_READ_FRESH_MS = 5_000;
export const PUBLIC_READ_STALE_MS = 15 * 60_000;
const MAX_ENTRIES = 300;
const MAX_BODY_BYTES = 1_000_000;

type StoredResponse = {
  body: ArrayBuffer;
  status: number;
  statusText: string;
  headers: [string, string][];
  storedAt: number;
};

type CacheState = {
  entries: Map<string, StoredResponse>;
  inFlight: Map<string, Promise<StoredResponse>>;
};

type Options = {
  scope: string;
  now?: () => number;
  freshMs?: number;
  staleMs?: number;
  state?: CacheState;
};

const VARY_HEADERS = ['accept', 'accept-profile', 'prefer', 'range'];

export function createPublicReadCacheState(): CacheState {
  return { entries: new Map(), inFlight: new Map() };
}

const sharedState = createPublicReadCacheState();

function toResponse(stored: StoredResponse): Response {
  // A null-body status must not be given a body.
  const body = [204, 205, 304].includes(stored.status) ? null : stored.body.slice(0);
  return new Response(body, { status: stored.status, statusText: stored.statusText, headers: stored.headers });
}

function remember(state: CacheState, key: string, stored: StoredResponse) {
  state.entries.delete(key);
  state.entries.set(key, stored);
  while (state.entries.size > MAX_ENTRIES) {
    const oldest = state.entries.keys().next().value;
    if (oldest === undefined) break;
    state.entries.delete(oldest);
  }
}

function cacheKey(scope: string, input: RequestInfo | URL, init: RequestInit): string {
  const url = input instanceof Request ? input.url : String(input);
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init.headers).forEach((value, name) => headers.set(name, value));
  const varying = VARY_HEADERS.map((name) => `${name}=${headers.get(name) ?? ''}`).join('&');
  return `${scope} ${url} ${varying}`;
}

export function withPublicReadCache(fetchImpl: typeof fetch, options: Options): typeof fetch {
  const state = options.state ?? sharedState;
  const now = options.now ?? Date.now;
  const freshMs = options.freshMs ?? PUBLIC_READ_FRESH_MS;
  const staleMs = options.staleMs ?? PUBLIC_READ_STALE_MS;

  return async (input, init = {}) => {
    const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (method !== 'GET') return fetchImpl(input, init);

    const key = cacheKey(options.scope, input, init);
    const cached = state.entries.get(key);
    if (cached && now() - cached.storedAt <= freshMs) return toResponse(cached);

    let pending = state.inFlight.get(key);
    if (!pending) {
      pending = (async () => {
        const response = await fetchImpl(input, init);
        if (!response.ok) throw Object.assign(new Error('non-ok'), { response });
        const body = await response.arrayBuffer();
        const stored: StoredResponse = {
          body,
          status: response.status,
          statusText: response.statusText,
          headers: [...response.headers.entries()],
          storedAt: now(),
        };
        if (body.byteLength <= MAX_BODY_BYTES) remember(state, key, stored);
        return stored;
      })();
      state.inFlight.set(key, pending);
      pending.then(() => state.inFlight.delete(key), () => state.inFlight.delete(key));
    }

    try {
      return toResponse(await pending);
    } catch (error) {
      const stale = state.entries.get(key);
      if (stale && now() - stale.storedAt <= staleMs) return toResponse(stale);
      const response = (error as { response?: Response }).response;
      // Every waiter gets its own copy of the upstream error response.
      if (response) return response.clone();
      throw error;
    }
  };
}

/** An abortable jittered pause keeps retries from hitting the small DB together. */
function retryPause(signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(new DOMException('This operation was aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, 200 + Math.floor(Math.random() * 200));
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
}

/** Bounded, uncached fetch. Only explicitly opted-in reads may be retried. */
export function createTimeoutFetch(timeoutMs: number, retryReads = false): typeof fetch {
  return async (input, init = {}) => {
    const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const canRetry = retryReads && ['GET', 'HEAD'].includes(method);
    const upstreamSignal = init.signal || (input instanceof Request ? input.signal : undefined);
    for (let attempt = 0; ; attempt += 1) {
      if (attempt > 0) await retryPause(upstreamSignal);
      const controller = new AbortController();
      const abort = () => controller.abort();
      const timeout = setTimeout(abort, timeoutMs);
      if (upstreamSignal?.aborted) controller.abort();
      else upstreamSignal?.addEventListener('abort', abort, { once: true });
      try {
        const response = await fetch(input, { ...init, cache: 'no-store', signal: controller.signal });
        if (canRetry && attempt === 0 && !upstreamSignal?.aborted && [502, 503, 504].includes(response.status)) {
          await response.body?.cancel();
          continue;
        }
        // PostgREST returns JSON. Keep the deadline alive until the body has
        // arrived, so a stalled/aborted body gets the same bounded read retry
        // as a connection failure. Never replay a mutation or buffer media.
        if (['GET', 'HEAD'].includes(method) && response.body && /(?:application\/json|\+json)(?:;|$)/i.test(response.headers.get('content-type') || '')) {
          const body = await response.arrayBuffer();
          const headers = new Headers(response.headers);
          headers.delete('content-length');
          headers.delete('content-encoding');
          return new Response(body, { status: response.status, statusText: response.statusText, headers });
        }
        return response;
      } catch (error) {
        // Never replay writes or an explicitly cancelled caller request.
        if (!canRetry || attempt > 0 || upstreamSignal?.aborted) throw error;
      } finally {
        clearTimeout(timeout);
        upstreamSignal?.removeEventListener('abort', abort);
      }
    }
  };
}

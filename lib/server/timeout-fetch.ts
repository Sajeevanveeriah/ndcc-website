/**
 * Bounded, uncached fetch. Only explicitly opted-in reads may be retried:
 * once after a gateway error or a network failure. A read that hit its own
 * time budget is replayed only when `retryAfterTimeout` is set (public CMS
 * reads, which are also coalesced so a replay adds one request per instance):
 * a request written to a dead pooled connection after an instance resumes
 * never reaches the database, and a fresh connection is what recovers it.
 */
export function createTimeoutFetch(timeoutMs: number, retryReads = false, options: { retryAfterTimeout?: boolean } = {}): typeof fetch {
  return async (input, init = {}) => {
    const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const canRetry = retryReads && ['GET', 'HEAD'].includes(method);
    const upstreamSignal = init.signal || (input instanceof Request ? input.signal : undefined);
    for (let attempt = 0; ; attempt += 1) {
      const controller = new AbortController();
      const abort = () => controller.abort();
      let timedOut = false;
      const timeout = setTimeout(() => { timedOut = true; abort(); }, timeoutMs);
      if (upstreamSignal?.aborted) controller.abort();
      else upstreamSignal?.addEventListener('abort', abort, { once: true });
      try {
        const response = await fetch(input, { ...init, cache: 'no-store', signal: controller.signal });
        if (canRetry && attempt === 0 && !upstreamSignal?.aborted && [502, 503, 504].includes(response.status)) {
          await response.body?.cancel();
          continue;
        }
        return response;
      } catch (error) {
        // Never replay writes or an explicitly cancelled caller request.
        if (!canRetry || attempt > 0 || (timedOut && !options.retryAfterTimeout) || upstreamSignal?.aborted) throw error;
      } finally {
        clearTimeout(timeout);
        upstreamSignal?.removeEventListener('abort', abort);
      }
    }
  };
}

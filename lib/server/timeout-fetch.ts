/** Bounded, uncached fetch. Only explicitly opted-in reads may be retried. */
export function createTimeoutFetch(timeoutMs: number, retryReads = false): typeof fetch {
  return async (input, init = {}) => {
    const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const canRetry = retryReads && ['GET', 'HEAD'].includes(method);
    const upstreamSignal = init.signal || (input instanceof Request ? input.signal : undefined);
    for (let attempt = 0; ; attempt += 1) {
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

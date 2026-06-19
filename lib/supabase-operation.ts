export type SupabaseOperationResult<TData = unknown, TError = { code?: string; message?: string; status?: number }> = {
  data: TData;
  error: TError | null;
  status?: number;
};

export type SupabaseOperationMeta = {
  attempts: number;
  retried: boolean;
  lastRetryable: boolean;
};

type Operation<T extends SupabaseOperationResult> = () => PromiseLike<T>;

const RETRY_DELAY_MIN_MS = 200;
const RETRY_DELAY_JITTER_MS = 200;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs() {
  return RETRY_DELAY_MIN_MS + Math.floor(Math.random() * RETRY_DELAY_JITTER_MS);
}

export function isRetryableSupabaseError(error: unknown, status?: number) {
  if (!error) return false;

  const value = error as { name?: string; message?: string; status?: number; code?: string };
  const resolvedStatus = Number(status || value.status || 0);
  const code = String(value.code || '').toLowerCase();
  const message = String(value.message || '').toLowerCase();

  if ([500, 502, 503, 504].includes(resolvedStatus)) return true;
  if (value.name === 'AbortError' || code === 'aborterror') return true;
  if (message.includes('abort') || message.includes('timeout')) return true;
  if (message.includes('fetch') || message.includes('network')) return true;
  if (message.includes('connection') || message.includes('temporarily unavailable')) return true;
  if (code.startsWith('5')) return true;

  return false;
}

export function isRetryableSupabaseException(error: unknown) {
  return isRetryableSupabaseError(error);
}

export async function withSupabaseOperationRetry<T extends SupabaseOperationResult>(
  operation: Operation<T>,
  onRetry?: (context: { source: 'result' | 'exception'; attempt: number; status?: number; code?: string }) => void,
): Promise<T & { operationMeta: SupabaseOperationMeta }> {
  let attempts = 0;
  let retried = false;
  let lastRetryable = false;

  const run = async () => {
    attempts += 1;
    return operation();
  };

  try {
    const first = await run();
    lastRetryable = isRetryableSupabaseError(first.error, first.status);

    if (!first.error || !lastRetryable) {
      return { ...first, operationMeta: { attempts, retried, lastRetryable } };
    }

    retried = true;
    onRetry?.({ source: 'result', attempt: attempts, status: first.status, code: (first.error as { code?: string } | null)?.code });
    await delay(retryDelayMs());
    const second = await run();
    lastRetryable = isRetryableSupabaseError(second.error, second.status);
    return { ...second, operationMeta: { attempts, retried, lastRetryable } };
  } catch (error) {
    lastRetryable = isRetryableSupabaseException(error);
    if (!lastRetryable) throw error;

    retried = true;
    onRetry?.({ source: 'exception', attempt: attempts, code: (error as { code?: string })?.code });
    await delay(retryDelayMs());
    const second = await run();
    lastRetryable = isRetryableSupabaseError(second.error, second.status);
    return { ...second, operationMeta: { attempts, retried, lastRetryable } };
  }
}

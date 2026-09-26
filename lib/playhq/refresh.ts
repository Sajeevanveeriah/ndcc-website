import 'server-only';
import { revalidatePath, revalidateTag } from 'next/cache';

const PLAYHQ_PUBLIC_PATHS = ['/fixtures', '/teams', '/'] as const;

/**
 * "Refresh PlayHQ now": purge the cached PlayHQ feed (unstable_cache and the
 * tagged provider fetches) and the ISR pages that render it. The next visit
 * reads PlayHQ again. Best-effort per path so one failure cannot block the rest.
 */
export function refreshPlayHQPublicData() {
  const failures: string[] = [];
  const attempt = (label: string, fn: () => void) => {
    try { fn(); } catch (error) { failures.push(`${label}: ${error instanceof Error ? error.message : 'failed'}`); }
  };
  attempt('playhq tag', () => revalidateTag('playhq'));
  for (const path of PLAYHQ_PUBLIC_PATHS) attempt(path, () => revalidatePath(path));
  attempt('/teams/[slug]', () => revalidatePath('/teams/[slug]', 'page'));
  return { refreshedAt: new Date().toISOString(), failures };
}

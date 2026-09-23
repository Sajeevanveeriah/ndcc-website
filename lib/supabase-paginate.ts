// PostgREST (Supabase) caps every response at `max_rows` (1000 by default),
// so a plain `select()` silently truncates long admin lists. `fetchAllPages`
// pages through a query with `.range()` until a short page is returned.

export const SUPABASE_PAGE_SIZE = 1000;
/** Hard stop so a runaway table cannot exhaust memory in a request. */
export const SUPABASE_MAX_ROWS = 100_000;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/**
 * Loads every row by calling `buildPage(from, to, stable)` for consecutive
 * ranges. `buildPage` must return a *fresh* query on each call.
 *
 * The first page is requested exactly like the original single query
 * (`stable = false`), so lists shorter than one page behave identically.
 * Only when the first page is full are all pages re-requested with
 * `stable = true`; the builder must then add a unique tiebreaker order (for
 * example `.order('id')`) so pages cannot overlap or skip rows.
 */
export async function fetchAllPages<T>(
  buildPage: (from: number, to: number, stable: boolean) => PageResult<T>,
  { pageSize = SUPABASE_PAGE_SIZE, maxRows = SUPABASE_MAX_ROWS }: { pageSize?: number; maxRows?: number } = {},
): Promise<{ data: T[]; error: null } | { data: null; error: { message: string } }> {
  const first = await buildPage(0, pageSize - 1, false);
  if (first.error) return { data: null, error: first.error };
  const firstPage = first.data ?? [];
  if (firstPage.length < pageSize) return { data: firstPage, error: null };

  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await buildPage(from, from + pageSize - 1, true);
    if (error) return { data: null, error };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return { data: rows, error: null };
}

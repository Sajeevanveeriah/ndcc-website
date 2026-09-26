// Supabase (PostgREST) caps an unpaged read at 1000 rows by default, silently
// truncating larger result sets. fetchAllPages reads a query in .range()
// windows until a short page arrives. The page callback must apply a stable,
// unique ordering (for example .order('id')) so rows are not skipped or
// repeated between pages. Kept free of imports so tests can load it directly.
export const SUPABASE_PAGE_SIZE = 1000;
const MAX_PAGES = 500;

export type PagedReadResult<T> = { data: T[] | null; error: { message: string } | null };

export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PagedReadResult<T>>,
  pageSize: number = SUPABASE_PAGE_SIZE,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error('Page size must be a positive whole number.');
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * pageSize;
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
  throw new Error('The result set is too large to read safely.');
}

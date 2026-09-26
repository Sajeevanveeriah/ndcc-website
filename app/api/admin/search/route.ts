import { NextResponse } from 'next/server';
import { requireAnyPermission } from '@/lib/auth/guard';
import { ALL_PERMISSIONS } from '@/lib/auth/permissions';
import { createServerClient } from '@/lib/supabase-server';
import { buildSearchFilter, sanitiseSearchTerm, searchSourcesForUser, SEARCH_RESULTS_PER_SOURCE, toSearchResult, type SearchResult } from '@/lib/admin-search';

export const dynamic = 'force-dynamic';
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function GET(request: Request) {
  // Any signed-in CMS user may search; each source is then limited to the
  // sections that user's permissions cover.
  const user = await requireAnyPermission(ALL_PERMISSIONS);
  if (!user) return reply({ success: false, error: 'Your account does not have access to search.' }, 403);

  const term = sanitiseSearchTerm(new URL(request.url).searchParams.get('q'));
  if (!term) return reply({ success: true, query: '', results: [], unavailable: [] });

  const sources = searchSourcesForUser(user);
  let supabase: ReturnType<typeof createServerClient>;
  try { supabase = createServerClient(); } catch { return reply({ success: false, error: 'Search is temporarily unavailable.' }, 503); }

  const unavailable: string[] = [];
  const groups = await Promise.all(sources.map(async (source) => {
    try {
      let query = supabase.from(source.table).select(source.select).or(buildSearchFilter(source, term));
      if (source.excludeDeleted) query = query.is('deleted_at', null);
      if (source.order) query = query.order(source.order.column, { ascending: source.order.ascending });
      const { data, error } = await query.limit(SEARCH_RESULTS_PER_SOURCE);
      if (error) { unavailable.push(source.label); return [] as SearchResult[]; }
      return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => toSearchResult(source, row));
    } catch {
      unavailable.push(source.label);
      return [] as SearchResult[];
    }
  }));
  return reply({ success: true, query: term, results: groups.flat(), unavailable });
}

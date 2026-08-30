import { NextResponse } from 'next/server';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';
import { getContentBlocks } from '@/lib/content-blocks';
import { fallbackContentBlocks } from '@/lib/fallback-content';
import { normalisePublicLinkUrl } from '@/lib/public-link-url';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const noStoreHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

function normaliseContentBlockLinks<T extends { cta_url?: unknown }>(blocks: T[]) {
  return blocks.map((block) => ({
    ...block,
    cta_url: normalisePublicLinkUrl(block.cta_url),
  }));
}

// Uncached live read: content blocks are edited through admin, so the response
// is assembled from Supabase on every request. Fallback blocks are reserved for
// unconfigured/failed-query states — never for a successful live result.
async function getActiveContentBlocks(page: string | null, keys: string | null) {
  if (!isServerSupabaseConfigured()) {
    const requested = keys?.split(',').map((k) => k.trim()).filter(Boolean);
    const values = Object.values(fallbackContentBlocks).filter((block) => {
      if (requested?.length) return requested.includes(block.block_key);
      if (page) return block.block_key.startsWith(`${page}.`);
      return true;
    });
    return { data: normaliseContentBlockLinks(values), error: null, source: 'fallback' as const, degraded: true };
  }

  const supabase = createServerClient();
  let query = supabase.from('content_blocks').select('*').eq('is_active', true).order('page_slug');
  if (page) query = query.eq('page_slug', page);
  if (keys) query = query.in('block_key', keys.split(',').map((k) => k.trim()).filter(Boolean));

  const { data, error } = await query;
  if (error) return { data: [], error: error.message, source: 'supabase' as const, degraded: false };
  return { data: normaliseContentBlockLinks(data ?? []), error: null, source: 'supabase' as const, degraded: false };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = searchParams.get('page');
  const keys = searchParams.get('keys');

  if (keys) {
    const blocks = await getContentBlocks(keys.split(',').map((key) => key.trim()).filter(Boolean));
    const degraded = !isServerSupabaseConfigured();
    return NextResponse.json(
      { success: true, data: Object.values(blocks), source: degraded ? 'fallback' : 'supabase', degraded, error: null },
      { headers: noStoreHeaders },
    );
  }

  const { data, error, source, degraded } = await getActiveContentBlocks(page, keys);
  if (error) return NextResponse.json({ success: true, data: [], source, degraded: true, error }, { headers: noStoreHeaders });
  return NextResponse.json({ success: true, data, source, degraded, error: null }, { headers: noStoreHeaders });
}

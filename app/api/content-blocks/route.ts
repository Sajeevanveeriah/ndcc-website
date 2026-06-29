import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';
import { getContentBlocks } from '@/lib/content-blocks';
import { fallbackContentBlocks, isProductionStaticBuild } from '@/lib/fallback-content';

export const dynamic = 'force-dynamic';

const getActiveContentBlocks = unstable_cache(async (page: string | null, keys: string | null) => {
  if (isProductionStaticBuild || !isServerSupabaseConfigured()) {
    const requested = keys?.split(',').map((k) => k.trim()).filter(Boolean);
    const values = Object.values(fallbackContentBlocks).filter((block) => {
      if (requested?.length) return requested.includes(block.block_key);
      if (page) return block.block_key.startsWith(`${page}.`);
      return true;
    });
    return { data: values, error: null, source: 'fallback' as const, degraded: true };
  }

  const supabase = createServerClient();
  let query = supabase.from('content_blocks').select('*').eq('is_active', true).order('page_slug');
  if (page) query = query.eq('page_slug', page);
  if (keys) query = query.in('block_key', keys.split(',').map((k) => k.trim()).filter(Boolean));

  const { data, error } = await query;
  if (error) return { data: [], error: error.message, source: 'supabase' as const, degraded: false };
  return { data: data ?? [], error: null, source: 'supabase' as const, degraded: false };
}, ['public-content-blocks'], { revalidate: 300, tags: ['content-blocks'] });

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = searchParams.get('page');
  const keys = searchParams.get('keys');

  if (keys) {
    const blocks = await getContentBlocks(keys.split(',').map((key) => key.trim()).filter(Boolean));
    return NextResponse.json({ success: true, data: Object.values(blocks), source: 'fallback', degraded: isProductionStaticBuild || !isServerSupabaseConfigured(), error: null });
  }

  const { data, error, source, degraded } = await getActiveContentBlocks(page, keys);
  if (error) return NextResponse.json({ success: true, data: [], source, degraded: true, error });
  return NextResponse.json({ success: true, data, source, degraded, error: null });
}

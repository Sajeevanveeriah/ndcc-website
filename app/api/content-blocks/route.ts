import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';
import { getContentBlocks } from '@/lib/content-blocks';

export const dynamic = 'force-dynamic';

const getActiveContentBlocks = unstable_cache(async (page: string | null, keys: string | null) => {
  const supabase = createServerClient();
  let query = supabase.from('content_blocks').select('*').eq('is_active', true).order('page_slug');
  if (page) query = query.eq('page_slug', page);
  if (keys) query = query.in('block_key', keys.split(',').map((k) => k.trim()).filter(Boolean));

  const { data, error } = await query;
  return { data: data ?? [], error: error?.message ?? null };
}, ['public-content-blocks'], { revalidate: 300, tags: ['content-blocks'] });

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = searchParams.get('page');
  const keys = searchParams.get('keys');

  if (keys) {
    const blocks = await getContentBlocks(keys.split(',').map((key) => key.trim()).filter(Boolean));
    return NextResponse.json({ success: true, data: Object.values(blocks) });
  }

  const { data, error } = await getActiveContentBlocks(page, keys);
  if (error) return NextResponse.json({ success: false, error }, { status: 500 });
  return NextResponse.json({ success: true, data });
}
